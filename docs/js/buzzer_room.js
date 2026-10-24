// @ts-nocheck
// Host moderator console for one buzzer room. Host actions are applied optimistically (the
// pending patch is rendered at once) and sent in order through a queue; a rejected action is
// dropped from the optimistic copy and its real error is shown.
import { sendHostAction } from "./room_store.js";
import { hostPatch, actionReason, availableActions, phaseDeadline, clockRemaining, gameClockOf, timeMillis, stateLine, formatSeconds, formatClock, teamClass, teamName, teamIds, CATEGORIES, LOG_LIMIT, timedPhase, clockRunning } from "./room_state.js";
import { createReader } from "./room_reader.js";
import { db, ensureAnonAuth } from "./firebase.js";
import { doc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
const $ = (id) => document.getElementById(id);
const els = {
    teams: $("teams"), roomCode: $("roomCode"), roomName: $("roomName"), copyInvite: $("copyInviteBtn"),
    hostNote: $("hostNote"), copyLabel: $("copyLabel"), stateLine: $("stateLine"), stateNote: $("stateNote"), phaseTime: $("phaseTime"),
    phaseLabel: $("phaseLabel"), lockout: $("lockout"), light: $("lockoutLight"), lockoutText: $("lockoutText"),
    buzzer: $("buzzer"), buzzerName: $("buzzerName"), buzzerTeam: $("buzzerTeam"), interruptTag: $("interruptTag"),
    primary: $("primaryBtn"), primaryLabel: $("primaryLabel"), primaryKey: $("primaryKey"),
    gradePair: $("gradePair"), correct: $("correctBtn"), correctLabel: $("correctLabel"),
    incorrect: $("incorrectBtn"), incorrectLabel: $("incorrectLabel"), bonusZone: $("bonusZone"),
    bonusTeam: $("bonusTeam"), dead: $("deadBtn"), next: $("nextBtn"), category: $("categorySelect"),
    adjustList: $("adjustList"), gameClock: $("gameClock"), clockStart: $("clockStartBtn"),
    clockPause: $("clockPauseBtn"), clockReset: $("clockResetBtn"), endGame: $("endGameBtn"),
    endConfirm: $("endConfirm"), endCancel: $("endCancelBtn"), endConfirmBtn: $("endConfirmBtn"),
    exportBtn: $("exportBtn"), roster: $("roster"), statsBody: $("statsBody"), logList: $("logList"),
    logCount: $("logCount")
};
const ADJUSTMENTS = [-10, -4, -1, 1, 4, 10];
const roomId = new URLSearchParams(window.location.search).get("roomId");
let uid = null;
let snap = null; // latest room from the server
let members = []; // players subcollection
let pending = []; // optimistic host actions: {id, patch, done, doneAt}
let queue = Promise.resolve();
let rafId = 0;
let firstSnapshot = true;
let renderedLogSeq = 0;
let lastBuzzKey = null;
let lastRun = {};
const anchors = new Map(); // phase or clock key -> local time it was first seen
const expired = new Set(); // phase keys already expired by this host
const painted = {};
let unsubRoom = null;
let unsubPlayers = null;
const reader = createReader({ roomId, getRoom: shown, act });
function note(message) {
    els.hostNote.textContent = message || "";
}
function setText(el, text) {
    if (el.textContent !== text)
        el.textContent = text;
}
function paint(name, key, fn) {
    if (painted[name] === key)
        return;
    painted[name] = key;
    fn();
}
/** The room as the host sees it: server state plus optimistic actions not yet confirmed. */
function shown() {
    if (!snap)
        return null;
    let room = snap;
    for (const op of pending)
        room = { ...room, ...op.patch };
    return room;
}
/** Local time a phase or clock run was first seen; server time only on the first load. */
function anchorFor(key, serverValue) {
    if (!key)
        return null;
    if (!anchors.has(key)) {
        const fromServer = firstSnapshot ? timeMillis(serverValue) : null;
        anchors.set(key, fromServer !== null && fromServer !== void 0 ? fromServer : Date.now());
    }
    return anchors.get(key);
}
function phaseDeadlineOf(room) {
    var _a, _b;
    return phaseDeadline(room, anchorFor((_a = room.timers) === null || _a === void 0 ? void 0 : _a.phaseKey, (_b = room.timers) === null || _b === void 0 ? void 0 : _b.phaseStartedAt));
}
function clockElapsed(room, now) {
    var _a;
    const clock = gameClockOf(room);
    if (clock.status !== "running")
        return 0;
    return Math.max(0, now - ((_a = anchorFor(clock.runKey, clock.startedAt)) !== null && _a !== void 0 ? _a : now));
}
function clockLeft(room, now) {
    return clockRemaining(room, clockElapsed(room, now));
}
function enqueue(task) {
    queue = queue.then(task, task);
    return queue;
}
/** Run a host action now (optimistic) and send it in order. */
function act(action, options = {}) {
    const room = shown();
    if (!room || !uid)
        return;
    const runKey = action + JSON.stringify(options);
    const now = Date.now();
    if (now - (lastRun[runKey] || 0) < 250)
        return;
    lastRun[runKey] = now;
    const reason = actionReason(room, action, options);
    if (reason) {
        note(reason);
        return;
    }
    const opId = `${action}-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const opts = { ...options, opId };
    let patch;
    try {
        patch = hostPatch(room, uid, action, opts, now);
    }
    catch (err) {
        note(err.message);
        return;
    }
    const op = { id: opId, patch, done: false, doneAt: 0 };
    pending.push(op);
    note("");
    render();
    enqueue(async () => {
        try {
            const wrote = await sendHostAction(roomId, action, opts, now);
            if (!wrote)
                drop(op);
            else {
                op.done = true;
                op.doneAt = Date.now();
            }
        }
        catch (err) {
            drop(op);
            note((err === null || err === void 0 ? void 0 : err.message) || "The action did not save. Try again.");
            render();
        }
    });
}
function drop(op) {
    pending = pending.filter((item) => item !== op);
}
/** Send an expiry once per phase, and only when the server still has that phase. */
function expireIfDue(room, now) {
    var _a;
    if (timedPhase(room) && now >= phaseDeadlineOf(room)) {
        const key = room.timers.phaseKey;
        if (((_a = snap === null || snap === void 0 ? void 0 : snap.timers) === null || _a === void 0 ? void 0 : _a.phaseKey) === key && !expired.has(key) && !snap.currentBuzz) {
            expired.add(key);
            enqueue(() => sendHostAction(roomId, "expire", { phaseKey: key }).catch(() => { }));
        }
    }
    const clock = gameClockOf(room);
    if (clock.status === "running" && clockLeft(room, now) <= 0) {
        const key = clock.runKey;
        if (snap && gameClockOf(snap).runKey === key && !expired.has(`clock:${key}`)) {
            expired.add(`clock:${key}`);
            enqueue(() => sendHostAction(roomId, "game_expire", { runKey: key }).catch(() => { }));
        }
    }
}
function needsLoop(room) {
    return timedPhase(room) || clockRunning(room);
}
function ensureLoop() {
    if (!rafId)
        rafId = requestAnimationFrame(frame);
}
function frame() {
    rafId = 0;
    const room = shown();
    if (!room)
        return;
    const now = Date.now();
    renderTimers(room, now);
    expireIfDue(room, now);
    if (needsLoop(room))
        ensureLoop();
}
function renderTimers(room, now) {
    if (timedPhase(room)) {
        setText(els.phaseTime, formatSeconds(phaseDeadlineOf(room) - now));
    }
    setText(els.gameClock, formatClock(clockLeft(room, now)));
}
// ---------- Panels ----------
function teamsKey(room) {
    var _a, _b;
    return JSON.stringify([room.scores, (_a = room.settings) === null || _a === void 0 ? void 0 : _a.teamNames, (_b = room.currentBuzz) === null || _b === void 0 ? void 0 : _b.team, room.status]);
}
function renderTeams(room) {
    paint("teams", teamsKey(room), () => {
        var _a, _b, _c;
        els.teams.replaceChildren();
        const buzzingTeam = (_a = room.currentBuzz) === null || _a === void 0 ? void 0 : _a.team;
        for (const team of teamIds(room)) {
            const card = document.createElement("div");
            card.className = `team-card ${teamClass(team)}${team === buzzingTeam ? " is-buzzing" : ""}`;
            const name = document.createElement("span");
            name.className = "team-name";
            name.textContent = teamName(room, team);
            const score = document.createElement("strong");
            score.className = "numerals";
            score.textContent = String((_c = (_b = room.scores) === null || _b === void 0 ? void 0 : _b[team]) !== null && _c !== void 0 ? _c : 0);
            card.append(name, score);
            els.teams.appendChild(card);
        }
    });
}
function renderHeader(room) {
    paint("header", JSON.stringify([room.roomCode, room.roomName]), () => {
        setText(els.roomCode, room.roomCode || "-----");
        setText(els.roomName, room.roomName || "");
        document.title = `${room.roomName || "Buzzer room"} | Atom Bowl`;
    });
}
function stateNoteOf(room) {
    const buzz = room.currentBuzz;
    const who = buzz ? `${buzz.name} (${teamName(room, buzz.team)})` : "";
    switch (room.status) {
        case "lobby": return "Start the first toss-up when everyone has joined. Players can join with the code now.";
        case "tossup_reading": return "Buzzers are open during the reading, so a buzz now is an interrupt.";
        case "tossup_open": return "Players can buzz until time runs out. Expiry is automatic.";
        case "tossup_locked": return (buzz === null || buzz === void 0 ? void 0 : buzz.interrupt) ? `${who} interrupted. Grade the answer.` : `${who} buzzed. Grade the answer.`;
        case "tossup_dead": return "Nobody got it. Start the next toss-up when you are ready.";
        case "bonus_ready": return `Bonus for ${teamName(room, room.bonusTeam)}. Start the bonus timer, or mark it when the team answers.`;
        case "bonus_open": return `Bonus timer running for ${teamName(room, room.bonusTeam)}.`;
        case "bonus_locked": return "Bonus answered. Mark it correct or incorrect.";
        case "between": return "Ready for the next toss-up.";
        case "ended": return "Scores are final. Nobody can buzz now.";
        default: return "";
    }
}
function renderState(room) {
    paint("state", JSON.stringify([stateLine(room), stateNoteOf(room)]), () => {
        setText(els.stateLine, stateLine(room));
        setText(els.stateNote, stateNoteOf(room));
        const label = {
            tossup_reading: "Reading, no timer",
            tossup_open: "Answer time",
            bonus_open: "Bonus time",
            tossup_locked: "Buzz to grade",
            bonus_locked: "Bonus to grade",
            ended: "Game over"
        }[room.status] || "No timer";
        setText(els.phaseLabel, label);
        if (!timedPhase(room))
            setText(els.phaseTime, "");
    });
}
function renderLockout(room) {
    const buzz = room.currentBuzz;
    const key = JSON.stringify([room.status, buzz === null || buzz === void 0 ? void 0 : buzz.uid, buzz === null || buzz === void 0 ? void 0 : buzz.at, room.lockoutTeams, room.bonusTeam]);
    paint("lockout", key, () => {
        var _a;
        let text = "Buzzers closed";
        let state = "closed";
        if (buzz) {
            text = `${teamName(room, buzz.team)} buzzed${buzz.interrupt ? " on an interrupt" : ""}`;
            state = "locked";
        }
        else if (room.status === "tossup_reading") {
            text = "Buzzers open for interrupts";
            state = "open";
        }
        else if (room.status === "tossup_open") {
            text = ((_a = room.lockoutTeams) === null || _a === void 0 ? void 0 : _a.length) ? `Open for ${teamIds(room).filter((t) => !room.lockoutTeams.includes(t)).map((t) => teamName(room, t)).join(", ")}` : "Buzzers open";
            state = "open";
        }
        else if (room.status === "bonus_open") {
            text = `Bonus open for ${teamName(room, room.bonusTeam)} only`;
            state = "open";
        }
        els.lockoutText.textContent = text;
        els.light.className = `light ${state === "locked" ? `locked ${teamClass(buzz.team)}` : state}`;
        const buzzKey = buzz ? `${buzz.uid}:${buzz.at}` : "";
        if (buzzKey && buzzKey !== lastBuzzKey && lastBuzzKey !== null)
            flashLight();
        lastBuzzKey = buzzKey || null;
    });
}
function flashLight() {
    els.light.classList.remove("flash");
    void els.light.offsetWidth;
    els.light.classList.add("flash");
}
function renderBuzzer(room) {
    const buzz = room.currentBuzz;
    paint("buzzer", JSON.stringify(buzz ? [buzz.uid, buzz.at, buzz.interrupt, buzz.team] : null), () => {
        els.buzzer.hidden = !buzz;
        if (!buzz)
            return;
        els.buzzer.className = `buzzer ${teamClass(buzz.team)}`;
        els.buzzerName.textContent = buzz.name || "Player";
        els.buzzerTeam.textContent = teamName(room, buzz.team);
        els.interruptTag.hidden = !buzz.interrupt;
    });
}
/** Primary button: what Start / Done reading / Next / Start bonus timer does right now. */
function primarySpec(room) {
    switch (room.status) {
        case "lobby": return { label: "Start tossup", action: "tossup_start", key: "Space" };
        case "tossup_reading": return { label: "Done reading", action: "done_reading", key: "Space" };
        case "tossup_open": return { label: "Waiting for a buzz", action: null, key: "Space" };
        case "tossup_dead":
        case "between": return { label: "Next tossup", action: "next_tossup", key: "N" };
        case "bonus_ready": return { label: "Start bonus timer", action: "bonus_start", key: "Space" };
        case "ended": return { label: "Game over", action: null, key: "Space" };
        default: return null; // grading states show the Correct / Incorrect pair instead
    }
}
/** What Space does: the primary action. Grading is never on Space, so a stray key press can't award points. */
function spaceAction(room) {
    if (gradeActions(room) && room.status !== "bonus_ready")
        return null;
    const spec = primarySpec(room);
    return (spec === null || spec === void 0 ? void 0 : spec.action) || null;
}
function gradeActions(room) {
    if (room.status === "tossup_locked")
        return { correct: "tossup_grade_correct", incorrect: "tossup_grade_incorrect" };
    if (["bonus_ready", "bonus_open", "bonus_locked"].includes(room.status))
        return { correct: "bonus_correct", incorrect: "bonus_wrong" };
    return null;
}
function renderControls(room, avail) {
    var _a, _b, _c, _d;
    const spec = primarySpec(room);
    const grades = gradeActions(room);
    const paintKey = JSON.stringify([room.status, spec === null || spec === void 0 ? void 0 : spec.label, (spec === null || spec === void 0 ? void 0 : spec.action) && ((_a = avail[spec.action]) === null || _a === void 0 ? void 0 : _a.reason), room.bonusTeam, grades, grades && [(_b = avail[grades.correct]) === null || _b === void 0 ? void 0 : _b.reason, (_c = avail[grades.incorrect]) === null || _c === void 0 ? void 0 : _c.reason]]);
    paint("controls", paintKey, () => {
        var _a;
        els.primary.hidden = !spec;
        if (spec) {
            setText(els.primaryLabel, spec.label);
            setText(els.primaryKey, spec.key);
            const reason = spec.action ? (_a = avail[spec.action]) === null || _a === void 0 ? void 0 : _a.reason : "Nothing to do until the timer ends.";
            els.primary.disabled = !!reason || !spec.action;
            els.primary.title = reason || "";
        }
        els.gradePair.hidden = !grades;
        if (grades) {
            const bonus = !!grades.correct.startsWith("bonus");
            setText(els.correctLabel, bonus ? "Bonus correct, +10" : "Correct, +4");
            setText(els.incorrectLabel, bonus ? "Bonus incorrect" : "Incorrect");
            els.correct.disabled = !avail[grades.correct].ok;
            els.incorrect.disabled = !avail[grades.incorrect].ok;
            els.correct.title = avail[grades.correct].reason;
            els.incorrect.title = avail[grades.incorrect].reason;
        }
        els.dead.disabled = !avail.tossup_dead.ok;
        els.dead.title = avail.tossup_dead.reason;
        els.next.disabled = !avail.next_tossup.ok;
        els.next.title = avail.next_tossup.reason;
        // The primary button already starts the next toss-up in these states; N still works.
        els.next.hidden = !!spec && (spec.action === "next_tossup" || spec.action === "tossup_start");
    });
    // Bonus zone is only meaningful once a toss-up is correct.
    const bonusVisible = ["bonus_ready", "bonus_open", "bonus_locked"].includes(room.status);
    els.bonusZone.hidden = !bonusVisible;
    if (bonusVisible) {
        paint("bonusTeam", JSON.stringify([teamIds(room), (_d = room.settings) === null || _d === void 0 ? void 0 : _d.teamNames, room.bonusTeam, room.status === "bonus_ready"]), () => {
            els.bonusTeam.replaceChildren(...teamIds(room).map((team) => new Option(teamName(room, team), team)));
            els.bonusTeam.value = room.bonusTeam;
            els.bonusTeam.disabled = room.status !== "bonus_ready";
            els.bonusTeam.title = room.status === "bonus_ready" ? "" : "The bonus team is locked once the timer starts.";
        });
    }
}
function renderCategory(room) {
    const current = room.currentCategory || "General";
    paint("category", JSON.stringify([current, room.status === "ended"]), () => {
        const names = CATEGORIES.includes(current) ? CATEGORIES : [...CATEGORIES, current];
        els.category.replaceChildren(...names.map((name) => new Option(name, name)));
        els.category.value = current;
        els.category.disabled = room.status === "ended";
    });
}
function renderAdjust(room) {
    var _a;
    const teams = teamIds(room);
    const key = JSON.stringify([teams, (_a = room.settings) === null || _a === void 0 ? void 0 : _a.teamNames, room.scores, ADJUSTMENTS.map((delta) => teams.map((team) => actionReason(room, "adjust_score", { team, delta })))]);
    paint("adjust", key, () => {
        var _a, _b;
        els.adjustList.replaceChildren();
        for (const team of teams) {
            const row = document.createElement("div");
            row.className = `adjust-row ${teamClass(team)}`;
            const label = document.createElement("span");
            label.className = "team-name";
            label.textContent = `${teamName(room, team)}: ${(_b = (_a = room.scores) === null || _a === void 0 ? void 0 : _a[team]) !== null && _b !== void 0 ? _b : 0}`;
            const buttons = document.createElement("div");
            buttons.className = "adjust-buttons";
            for (const delta of ADJUSTMENTS) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "btn";
                button.textContent = delta > 0 ? `+${delta}` : String(delta);
                button.setAttribute("aria-label", `Adjust ${teamName(room, team)} by ${delta}`);
                const reason = actionReason(room, "adjust_score", { team, delta });
                button.disabled = !!reason;
                button.title = reason;
                button.addEventListener("click", () => act("adjust_score", { team, delta }));
                buttons.appendChild(button);
            }
            row.append(label, buttons);
            els.adjustList.appendChild(row);
        }
    });
}
function renderClock(room, avail) {
    const key = JSON.stringify([avail.game_start.reason, avail.game_pause.reason, avail.game_reset.reason, avail.end_game.reason, room.status]);
    paint("clock", key, () => {
        for (const [button, action] of [[els.clockStart, "game_start"], [els.clockPause, "game_pause"], [els.clockReset, "game_reset"], [els.endGame, "end_game"]]) {
            button.disabled = !avail[action].ok;
            button.title = avail[action].reason;
        }
    });
}
function renderRoster(room) {
    var _a;
    const key = JSON.stringify([members, room.hostUid, (_a = room.settings) === null || _a === void 0 ? void 0 : _a.teamNames, teamIds(room)]);
    paint("roster", key, () => {
        els.roster.replaceChildren();
        const host = members.find((member) => member.id === room.hostUid);
        if (host) {
            const group = document.createElement("div");
            group.className = "roster-group moderator";
            const heading = document.createElement("h3");
            heading.textContent = "Moderator";
            const list = document.createElement("ul");
            list.className = "roster-list";
            const item = document.createElement("li");
            item.textContent = host.name || "Host";
            list.appendChild(item);
            group.append(heading, list);
            els.roster.appendChild(group);
        }
        const teams = teamIds(room);
        for (const team of teams) {
            const group = document.createElement("div");
            group.className = `roster-group ${teamClass(team)}`;
            const people = members.filter((member) => member.team === team && member.id !== room.hostUid)
                .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            const heading = document.createElement("h3");
            const title = document.createElement("span");
            title.textContent = teamName(room, team);
            const count = document.createElement("span");
            count.className = "roster-count";
            count.textContent = people.length === 1 ? "1 player" : `${people.length} players`;
            heading.append(title, count);
            const list = document.createElement("ul");
            list.className = "roster-list";
            if (!people.length) {
                const empty = document.createElement("li");
                empty.className = "muted";
                empty.textContent = "No players yet";
                list.appendChild(empty);
            }
            for (const person of people) {
                const item = document.createElement("li");
                const name = document.createElement("span");
                name.textContent = person.name || "Player";
                item.appendChild(name);
                list.appendChild(item);
            }
            group.append(heading, list);
            els.roster.appendChild(group);
        }
    });
}
function renderStats(room) {
    var _a, _b;
    paint("stats", JSON.stringify([(_a = room.stats) === null || _a === void 0 ? void 0 : _a.player, (_b = room.settings) === null || _b === void 0 ? void 0 : _b.teamNames]), () => {
        var _a;
        els.statsBody.replaceChildren();
        const entries = Object.entries(((_a = room.stats) === null || _a === void 0 ? void 0 : _a.player) || {}).sort((a, b) => (a[1].name || "").localeCompare(b[1].name || ""));
        for (const [id, data] of entries) {
            const row = document.createElement("tr");
            const cells = [data.name || id.slice(0, 6), teamName(room, data.team || "?"), data.correct || 0, data.incorrect || 0, data.interrupt || 0, data.buzzes || 0];
            for (const value of cells) {
                const cell = document.createElement("td");
                cell.textContent = String(value);
                row.appendChild(cell);
            }
            els.statsBody.appendChild(row);
        }
        if (!entries.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 6;
            cell.className = "muted";
            cell.textContent = "Stats appear after the first buzz.";
            row.appendChild(cell);
            els.statsBody.appendChild(row);
        }
    });
}
function logItem(entry) {
    const item = document.createElement("li");
    const time = document.createElement("time");
    time.textContent = new Date(entry.at || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    item.append(time, document.createTextNode(entry.details || entry.type || ""));
    return item;
}
/** Log is newest first. New entries are prepended; a rollback (failed action) rebuilds it. */
function renderLog(room) {
    const entries = room.log || [];
    const lastSeq = entries.length ? entries[entries.length - 1].seq || 0 : 0;
    setText(els.logCount, entries.length ? `(${entries.length})` : "");
    if (lastSeq === renderedLogSeq)
        return;
    if (lastSeq < renderedLogSeq) {
        els.logList.replaceChildren(...entries.slice().reverse().map(logItem));
    }
    else {
        const fresh = entries.filter((entry) => (entry.seq || 0) > renderedLogSeq);
        for (const entry of fresh)
            els.logList.prepend(logItem(entry));
    }
    while (els.logList.children.length > LOG_LIMIT)
        els.logList.lastElementChild.remove();
    renderedLogSeq = lastSeq;
}
function render() {
    const room = shown();
    if (!room)
        return;
    const avail = availableActions(room);
    renderHeader(room);
    renderTeams(room);
    renderState(room);
    renderLockout(room);
    renderBuzzer(room);
    renderControls(room, avail);
    renderCategory(room);
    renderAdjust(room);
    renderClock(room, avail);
    renderRoster(room);
    renderStats(room);
    renderLog(room);
    reader.sync(room);
    renderTimers(room, Date.now());
    if (room.status === "ended")
        els.endConfirm.hidden = true;
    if (needsLoop(room))
        ensureLoop();
}
// ---------- Actions ----------
function spaceTarget(room) {
    const action = spaceAction(room);
    if (!action)
        return null;
    return { action, options: action === "bonus_start" ? { team: room.bonusTeam } : {} };
}
function runSpace() {
    const room = shown();
    if (!room)
        return;
    const target = spaceTarget(room);
    if (!target) {
        return note(gradeActions(room) && room.status !== "bonus_ready"
            ? "Grade with C for correct or X for incorrect."
            : "Nothing to do right now.");
    }
    act(target.action, target.options);
}
function runGrade(which) {
    const room = shown();
    if (!room)
        return;
    const grades = gradeActions(room);
    if (!grades)
        return note("There is no buzz or bonus to grade.");
    act(grades[which]);
}
function csvCell(value) {
    let text = String(value !== null && value !== void 0 ? value : "");
    if (/^[=+@\-\t\r]/.test(text))
        text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}
function exportCsv() {
    var _a, _b, _c, _d;
    if (!snap)
        return;
    const lines = ["Team,Score,Correct,Incorrect,Interrupt,Buzzes"];
    for (const team of teamIds(snap)) {
        const stats = ((_b = (_a = snap.stats) === null || _a === void 0 ? void 0 : _a.team) === null || _b === void 0 ? void 0 : _b[team]) || {};
        lines.push([teamName(snap, team), ((_c = snap.scores) === null || _c === void 0 ? void 0 : _c[team]) || 0, stats.correct || 0, stats.incorrect || 0, stats.interrupt || 0, stats.buzzes || 0].map(csvCell).join(","));
    }
    lines.push("", "Player,Team,Correct,Incorrect,Interrupt,Buzzes");
    for (const player of Object.values(((_d = snap.stats) === null || _d === void 0 ? void 0 : _d.player) || {})) {
        lines.push([player.name, player.team, player.correct || 0, player.incorrect || 0, player.interrupt || 0, player.buzzes || 0].map(csvCell).join(","));
    }
    lines.push("", "Log");
    for (const entry of snap.log || []) {
        lines.push(csvCell(`${new Date(entry.at || Date.now()).toISOString()} - ${entry.details || entry.type}`));
    }
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `atom-bowl-${snap.roomCode || "room"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copyInvite() {
    if (!snap)
        return;
    const link = new URL(`/buzzer-rooms?code=${encodeURIComponent(snap.roomCode)}`, window.location.href).href;
    const text = `Join my Atom Bowl room${snap.roomName ? ` "${snap.roomName}"` : ""} with code ${snap.roomCode}: ${link}`;
    let copied = false;
    try {
        await navigator.clipboard.writeText(text);
        copied = true;
    }
    catch { }
    if (!copied)
        window.prompt("Copy this invite:", text);
    setText(els.copyLabel, copied ? "Copied" : "Copy invite");
    if (copied)
        setTimeout(() => setText(els.copyLabel, "Copy invite"), 1500);
}
function isTyping(el) {
    return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}
function onKey(event) {
    if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey)
        return;
    const active = document.activeElement;
    if (isTyping(active))
        return;
    if (event.code === "Space") {
        // A focused button handles Space itself.
        if (active && active.tagName === "BUTTON")
            return;
        event.preventDefault();
        runSpace();
        return;
    }
    const key = event.key.toLowerCase();
    if (key === "c") {
        event.preventDefault();
        runGrade("correct");
    }
    else if (key === "x") {
        event.preventDefault();
        runGrade("incorrect");
    }
    else if (key === "d") {
        event.preventDefault();
        act("tossup_dead");
    }
    else if (key === "n") {
        event.preventDefault();
        act("next_tossup");
    }
}
// ---------- Wiring ----------
els.primary.addEventListener("click", () => runSpace());
els.correct.addEventListener("click", () => runGrade("correct"));
els.incorrect.addEventListener("click", () => runGrade("incorrect"));
els.dead.addEventListener("click", () => act("tossup_dead"));
els.next.addEventListener("click", () => act("next_tossup"));
els.category.addEventListener("change", () => act("set_category", { category: els.category.value }));
els.bonusTeam.addEventListener("change", () => act("bonus_team", { team: els.bonusTeam.value }));
els.clockStart.addEventListener("click", () => act("game_start"));
els.clockPause.addEventListener("click", () => {
    const room = shown();
    act("game_pause", { elapsedMs: room ? clockElapsed(room, Date.now()) : 0 });
});
els.clockReset.addEventListener("click", () => act("game_reset"));
els.endGame.addEventListener("click", () => { els.endConfirm.hidden = false; els.endConfirmBtn.focus(); });
els.endCancel.addEventListener("click", () => { els.endConfirm.hidden = true; els.endGame.focus(); });
els.endConfirmBtn.addEventListener("click", () => {
    els.endConfirm.hidden = true;
    const room = shown();
    act("end_game", { elapsedMs: room ? clockElapsed(room, Date.now()) : 0 });
});
els.exportBtn.addEventListener("click", exportCsv);
els.copyInvite.addEventListener("click", copyInvite);
document.addEventListener("keydown", onKey);
function attach(room) {
    if (unsubRoom)
        unsubRoom();
    unsubRoom = onSnapshot(doc(db, "rooms", room), (snapshot) => {
        if (!snapshot.exists()) {
            snap = null;
            note("This room no longer exists.");
            return;
        }
        const data = snapshot.data();
        if (data.hostUid !== uid) {
            window.location.replace(`/buzzer-room-player?roomId=${encodeURIComponent(room)}`);
            return;
        }
        snap = data;
        pending = pending.filter((op) => { var _a; return !(op.done && (((_a = data.lastAction) === null || _a === void 0 ? void 0 : _a.id) === op.id || Date.now() - op.doneAt > 4000)); });
        render();
        firstSnapshot = false;
    }, (err) => note(`Cannot read this room: ${err.message}`));
    if (unsubPlayers)
        unsubPlayers();
    unsubPlayers = onSnapshot(collection(db, "rooms", room, "players"), (snapshot) => {
        members = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        if (snap)
            render();
    }, (err) => note(`Cannot read players: ${err.message}`));
}
(async () => {
    if (!roomId) {
        note("This page needs a room. Open a room from the buzzer rooms page.");
        return;
    }
    const user = await ensureAnonAuth();
    uid = user.uid;
    attach(roomId);
})().catch((err) => note(err.message || "Unable to connect to the room."));
window.addEventListener("pagehide", () => {
    unsubRoom === null || unsubRoom === void 0 ? void 0 : unsubRoom();
    unsubPlayers === null || unsubPlayers === void 0 ? void 0 : unsubPlayers();
    if (rafId)
        cancelAnimationFrame(rafId);
});
window.addEventListener("pageshow", (event) => {
    if (event.persisted)
        window.location.reload();
});
//# sourceMappingURL=buzzer_room.js.map