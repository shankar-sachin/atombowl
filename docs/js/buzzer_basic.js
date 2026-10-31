// @ts-nocheck
// Host screen for a Basic game: a code, a lock/clear buzzer, a scoreboard, a timer and a game clock.
// Host actions are applied optimistically and sent in order, like the Advanced console.
import { sendHostAction } from "./room_store.js";
import { hostPatch, actionReason, timeMillis, teamIds, teamName, teamClass, formatClock, gameClockOf, clockRemaining, timerOf, timerRemaining, playerPoints, isBasic, gameDurationMs } from "./room_state.js";
import { db, ensureAnonAuth } from "./firebase.js";
import { doc, collection, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
const $ = (id) => document.getElementById(id);
const els = {
    main: $("basicMain"), statusDot: $("statusDot"), statusText: $("statusText"), settingsBtn: $("settingsBtn"),
    fullscreen: $("fullscreenBtn"), endBtn: $("endBtn"), note: $("hostNote"), endConfirm: $("endConfirm"),
    endCancel: $("endCancelBtn"), endConfirmBtn: $("endConfirmBtn"),
    swPoints: $("swPoints"), swTeams: $("swTeams"), swTimer: $("swTimer"), swClock: $("swClock"),
    code: $("roomCode"), copy: $("copyBtn"), copyLabel: $("copyLabel"), clear: $("clearBtn"), lock: $("lockBtn"),
    lockLabel: $("lockLabel"), buzzer: $("buzzer"), buzzerName: $("buzzerName"), buzzerTeam: $("buzzerTeam"),
    timerPanel: $("timerPanel"), timerDisplay: $("timerDisplay"), timerStart: $("timerStart"), timerPause: $("timerPause"),
    timerReset: $("timerReset"), clockPanel: $("clockPanel"), gameClock: $("gameClock"), clockStart: $("clockStart"),
    clockPause: $("clockPause"), clockReset: $("clockReset"), playerList: $("playerList"), playerCount: $("playerCount"),
    over: $("over"), dialog: $("settingsDialog"), settingsBody: $("settingsBody")
};
const roomId = new URLSearchParams(window.location.search).get("roomId");
let uid = null;
let snap = null;
let members = [];
let pending = [];
let queue = Promise.resolve();
let rafId = 0;
let firstSnapshot = true;
let lastBuzzKey = null;
const anchors = new Map();
const expired = new Set();
const painted = {};
const updaters = [];
let audio = null;
function note(message) { els.note.textContent = message || ""; }
function setText(el, text) { if (el.textContent !== text)
    el.textContent = text; }
function paint(name, key, fn) {
    if (painted[name] === key)
        return;
    painted[name] = key;
    fn();
}
function setSwitch(button, on) {
    button.classList.toggle("on", !!on);
    button.setAttribute("aria-checked", String(!!on));
}
const flag = (room, key, fallback = false) => { var _a; return (((_a = room.settings) === null || _a === void 0 ? void 0 : _a[key]) === undefined ? fallback : !!room.settings[key]); };
const num = (room, key, fallback) => { var _a; return (Number.isInteger((_a = room.settings) === null || _a === void 0 ? void 0 : _a[key]) ? room.settings[key] : fallback); };
function shown() {
    if (!snap)
        return null;
    let room = snap;
    for (const op of pending)
        room = { ...room, ...op.patch };
    return room;
}
function anchorFor(key, serverValue) {
    var _a;
    if (!key)
        return null;
    if (!anchors.has(key))
        anchors.set(key, (_a = (firstSnapshot ? timeMillis(serverValue) : null)) !== null && _a !== void 0 ? _a : Date.now());
    return anchors.get(key);
}
function timerElapsed(room, now) {
    var _a;
    const timer = timerOf(room);
    return timer.status === "running" ? Math.max(0, now - ((_a = anchorFor(timer.runKey, timer.startedAt)) !== null && _a !== void 0 ? _a : now)) : 0;
}
function timerLeft(room, now) { return timerRemaining(room, timerElapsed(room, now)); }
function clockElapsed(room, now) {
    var _a;
    const clock = gameClockOf(room);
    return clock.status === "running" ? Math.max(0, now - ((_a = anchorFor(clock.runKey, clock.startedAt)) !== null && _a !== void 0 ? _a : now)) : 0;
}
const clockLive = (room) => gameClockOf(room).status === "running";
function enqueue(task) {
    queue = queue.then(task, task);
    return queue;
}
function act(action, options = {}) {
    const room = shown();
    if (!room || !uid)
        return;
    const reason = actionReason(room, action, options);
    if (reason)
        return note(reason);
    const now = Date.now();
    const opId = `${action}-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const opts = { ...options, opId };
    let patch;
    try {
        patch = hostPatch(room, uid, action, opts, now);
    }
    catch (err) {
        return note(err.message);
    }
    const op = { id: opId, patch, done: false, doneAt: 0 };
    pending.push(op);
    note("");
    render();
    enqueue(async () => {
        try {
            const wrote = await sendHostAction(roomId, action, opts, now);
            if (!wrote)
                pending = pending.filter((item) => item !== op);
            else {
                op.done = true;
                op.doneAt = Date.now();
            }
        }
        catch (err) {
            pending = pending.filter((item) => item !== op);
            note((err === null || err === void 0 ? void 0 : err.message) || "That did not save. Try again.");
            render();
        }
    });
}
function beep(freq = 880, ms = 220) {
    try {
        audio || (audio = new (window.AudioContext || window.webkitAudioContext)());
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.frequency.value = freq;
        gain.gain.value = 0.15;
        osc.connect(gain).connect(audio.destination);
        osc.start();
        osc.stop(audio.currentTime + ms / 1000);
    }
    catch { }
}
// ---------- Timers ----------
function ensureLoop() { if (!rafId)
    rafId = requestAnimationFrame(frame); }
function frame() {
    rafId = 0;
    const room = shown();
    if (!room)
        return;
    const now = Date.now();
    renderTimers(room, now);
    const timer = timerOf(room);
    if (timer.status === "running" && timerLeft(room, now) <= 0 && snap && timerOf(snap).runKey === timer.runKey && !expired.has(timer.runKey)) {
        expired.add(timer.runKey);
        if (flag(room, "timerSound", true))
            beep(660, 600);
        enqueue(() => sendHostAction(roomId, "timer_expire", { runKey: timer.runKey }).catch(() => { }));
    }
    const clock = gameClockOf(room);
    if (clock.status === "running" && clockRemaining(room, clockElapsed(room, now)) <= 0 && snap && gameClockOf(snap).runKey === clock.runKey && !expired.has(`c${clock.runKey}`)) {
        expired.add(`c${clock.runKey}`);
        beep(660, 800);
        enqueue(() => sendHostAction(roomId, "game_expire", { runKey: clock.runKey }).catch(() => { }));
    }
    if (timerOf(room).status === "running" || clockLive(room))
        ensureLoop();
}
function renderTimers(room, now) {
    setText(els.timerDisplay, formatClock(timerLeft(room, now)));
    setText(els.gameClock, formatClock(clockRemaining(room, clockElapsed(room, now))));
}
// ---------- Settings dialog ----------
function section(title) {
    const h = document.createElement("h3");
    h.className = "settings-section";
    h.textContent = title;
    els.settingsBody.appendChild(h);
}
function row(label, help, control) {
    const wrap = document.createElement("div");
    wrap.className = "rule-row settings-row";
    const text = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = label;
    text.appendChild(title);
    if (help) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = help;
        text.appendChild(p);
    }
    wrap.append(text, control);
    els.settingsBody.appendChild(wrap);
}
function switchRow(label, help, get, set) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toggle";
    button.setAttribute("role", "switch");
    button.setAttribute("aria-label", label);
    const knob = document.createElement("span");
    knob.className = "knob";
    button.appendChild(knob);
    button.addEventListener("click", () => set(!get(shown())));
    row(label, help, button);
    updaters.push((room) => setSwitch(button, get(room)));
}
function numberRow(label, help, min, max, get, set, unit = "") {
    const wrap = document.createElement("div");
    wrap.className = "number-control";
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.inputMode = "numeric";
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => {
        const value = parseInt(input.value, 10);
        if (Number.isInteger(value) && value >= min && value <= max)
            set(value);
        else
            input.value = String(get(shown()));
    });
    wrap.appendChild(input);
    if (unit) {
        const u = document.createElement("span");
        u.className = "muted";
        u.textContent = unit;
        wrap.appendChild(u);
    }
    row(label, help, wrap);
    updaters.push((room) => { if (document.activeElement !== input)
        input.value = String(get(room)); });
}
function buttonRow(label, help, text, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn danger small";
    button.textContent = text;
    button.addEventListener("click", handler);
    row(label, help, button);
}
const change = (key, value) => act("set_settings", { changes: { [key]: value } });
const ROUND_KEYS = ["timerUnlockOnStart", "timerLockOnEnd", "timerLockOnPause", "timerResetBuzzers"];
function buildSettings() {
    section("Points");
    switchRow("Show points", "Points beside each player.", (r) => flag(r, "showPoints", true), (v) => change("showPoints", v));
    numberRow("Plus gives", "Points added by the plus button.", 1, 1000, (r) => num(r, "plusPoints", 1), (v) => change("plusPoints", v));
    numberRow("Minus takes", "Points taken by the minus button.", 1, 1000, (r) => num(r, "minusPoints", 1), (v) => change("minusPoints", v));
    section("Teams");
    switchRow("Show teams", "Group players by team, with team totals.", (r) => flag(r, "showTeams"), (v) => change("showTeams", v));
    numberRow("Number of teams", "Players pick a team when they join. A team with players can't be removed.", 1, 4, (r) => teamIds(r).length, (v) => {
        const room = shown();
        const gone = teamIds(room).slice(v);
        if (members.some((m) => m.id !== room.hostUid && gone.includes(m.team)))
            return note("Remove the players on the last team first.");
        act("set_teams", { count: v });
    });
    section("Sound");
    switchRow("Buzz sound", "Play a sound on this device when someone buzzes.", (r) => flag(r, "buzzSound", true), (v) => change("buzzSound", v));
    section("Timer / round");
    switchRow("Show timer", "", (r) => flag(r, "showTimer", true), (v) => change("showTimer", v));
    switchRow("Play sound on timer end", "", (r) => flag(r, "timerSound", true), (v) => change("timerSound", v));
    numberRow("Set timer", "Length in seconds. You can also click the timer's numbers.", 1, 36000, (r) => Math.round(timerOf(r).durationMs / 1000), (v) => act("timer_set", { seconds: v }), "s");
    switchRow("Enable round mode", "Turns on the four settings below. Tweak them, or turn them all off to leave round mode.", (r) => ROUND_KEYS.some((k) => flag(r, k)), (v) => act("set_settings", { changes: Object.fromEntries(ROUND_KEYS.map((k) => [k, v])) }));
    switchRow("Unlock buzzers when timer starts", "", (r) => flag(r, "timerUnlockOnStart"), (v) => change("timerUnlockOnStart", v));
    switchRow("Lock buzzers when timer ends", "", (r) => flag(r, "timerLockOnEnd"), (v) => change("timerLockOnEnd", v));
    switchRow("Lock buzzers on timer pause", "", (r) => flag(r, "timerLockOnPause"), (v) => change("timerLockOnPause", v));
    switchRow("Reset buzzers when timer is reset", "", (r) => flag(r, "timerResetBuzzers"), (v) => change("timerResetBuzzers", v));
    switchRow("Start timer when a player buzzes", "", (r) => flag(r, "timerStartOnBuzz"), (v) => change("timerStartOnBuzz", v));
    switchRow("Pause timer when a player buzzes", "", (r) => flag(r, "timerPauseOnBuzz"), (v) => change("timerPauseOnBuzz", v));
    section("Game clock");
    switchRow("Show game clock", "", (r) => flag(r, "showClock"), (v) => change("showClock", v));
    numberRow("Set game clock", "Length in minutes. You can also click the clock's numbers.", 1, 1440, (r) => Math.max(1, Math.round(gameDurationMs(r) / 60000)), (v) => act("game_set", { seconds: v * 60 }), "min");
    section("Danger zone");
    buttonRow("Remove all players", "They can rejoin with the code.", "Remove all", async () => {
        if (!window.confirm("Remove all players?"))
            return;
        const room = shown();
        await Promise.all(members.filter((m) => m.id !== room.hostUid).map((m) => deleteDoc(doc(db, "rooms", roomId, "players", m.id)).catch(() => { })));
    });
    buttonRow("Remove all points", "Sets every player and team to 0.", "Reset points", () => {
        if (window.confirm("Reset all points to 0?"))
            act("reset_points");
    });
}
function parseTime(text) {
    const value = String(text || "").trim();
    if (!value)
        return null;
    const parts = value.split(":").map((p) => parseInt(p, 10));
    if (parts.some((p) => !Number.isFinite(p) || p < 0))
        return null;
    return parts.length === 2 ? parts[0] * 60 + parts[1] : parts.length === 1 ? parts[0] : null;
}
// ---------- Render ----------
function renderPlayers(room) {
    var _a, _b;
    const key = JSON.stringify([members, room.hostUid, (_a = room.stats) === null || _a === void 0 ? void 0 : _a.player, room.scores, room.settings, (_b = room.currentBuzz) === null || _b === void 0 ? void 0 : _b.uid]);
    paint("players", key, () => {
        var _a, _b, _c;
        const showPoints = flag(room, "showPoints", true);
        const showTeams = flag(room, "showTeams");
        const people = members.filter((m) => m.id !== room.hostUid);
        setText(els.playerCount, people.length ? `(${people.length})` : "");
        els.playerList.replaceChildren();
        if (!people.length) {
            const empty = document.createElement("p");
            empty.className = "muted";
            empty.textContent = "No players yet. Share the code.";
            els.playerList.appendChild(empty);
            return;
        }
        const groups = showTeams ? teamIds(room) : [null];
        for (const team of groups) {
            const list = people.filter((m) => team === null || m.team === team)
                .sort((a, b) => playerPoints(room, b.id) - playerPoints(room, a.id) || (a.name || "").localeCompare(b.name || ""));
            const group = document.createElement("div");
            group.className = `player-group ${team ? teamClass(team) : ""}`;
            if (team) {
                const head = document.createElement("h3");
                const label = document.createElement("span");
                label.textContent = teamName(room, team);
                head.appendChild(label);
                if (showPoints) {
                    const total = document.createElement("strong");
                    total.className = "numerals";
                    total.textContent = String((_b = (_a = room.scores) === null || _a === void 0 ? void 0 : _a[team]) !== null && _b !== void 0 ? _b : 0);
                    head.appendChild(total);
                }
                group.appendChild(head);
            }
            for (const person of list) {
                const line = document.createElement("div");
                line.className = `player-row${((_c = room.currentBuzz) === null || _c === void 0 ? void 0 : _c.uid) === person.id ? " is-buzzing" : ""}`;
                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "x-btn";
                remove.textContent = "×";
                remove.setAttribute("aria-label", `Remove ${person.name || "player"}`);
                remove.addEventListener("click", () => deleteDoc(doc(db, "rooms", roomId, "players", person.id)).catch((e) => note(e.message)));
                const name = document.createElement("span");
                name.className = "player-name";
                name.textContent = person.name || "Player";
                line.append(remove, name);
                if (showPoints) {
                    const points = document.createElement("strong");
                    points.className = "numerals player-points";
                    points.textContent = String(playerPoints(room, person.id));
                    const mk = (sign, amount) => {
                        const b = document.createElement("button");
                        b.type = "button";
                        b.className = "btn small points-btn";
                        b.textContent = sign > 0 ? `+${amount}` : `−${amount}`;
                        b.setAttribute("aria-label", `${sign > 0 ? "Add" : "Take"} ${amount} ${sign > 0 ? "to" : "from"} ${person.name}`);
                        b.addEventListener("click", () => act("adjust_player", { uid: person.id, name: person.name || "Player", team: person.team, delta: sign * amount }));
                        return b;
                    };
                    line.append(points, mk(-1, num(room, "minusPoints", 1)), mk(1, num(room, "plusPoints", 1)));
                }
                group.appendChild(line);
            }
            els.playerList.appendChild(group);
        }
    });
}
function render() {
    const room = shown();
    if (!room)
        return;
    const ended = room.status === "ended";
    paint("head", JSON.stringify([room.roomCode, room.roomName]), () => {
        setText(els.code, room.roomCode || "-----");
        document.title = `Game ${room.roomCode} | Atom Bowl`;
    });
    setSwitch(els.swPoints, flag(room, "showPoints", true));
    setSwitch(els.swTeams, flag(room, "showTeams"));
    setSwitch(els.swTimer, flag(room, "showTimer", true));
    setSwitch(els.swClock, flag(room, "showClock"));
    els.timerPanel.hidden = !flag(room, "showTimer", true);
    els.clockPanel.hidden = !flag(room, "showClock");
    const locked = !!room.locked;
    setSwitch(els.lock, locked);
    setText(els.lockLabel, locked ? "Locked" : "Unlocked");
    els.lock.classList.toggle("is-locked", locked);
    els.lock.disabled = els.clear.disabled = ended;
    const buzz = room.currentBuzz;
    els.buzzer.hidden = !buzz;
    if (buzz) {
        els.buzzer.className = `buzzer ${teamClass(buzz.team)}`;
        setText(els.buzzerName, `${buzz.name || "Player"} buzzed`);
        setText(els.buzzerTeam, flag(room, "showTeams") ? teamName(room, buzz.team) : "");
    }
    els.over.hidden = !ended;
    els.endBtn.disabled = ended;
    renderPlayers(room);
    for (const update of updaters)
        update(room);
    els.timerStart.disabled = !!actionReason(room, "timer_start");
    els.timerPause.disabled = !!actionReason(room, "timer_pause");
    els.clockStart.disabled = !!actionReason(room, "game_start");
    els.clockPause.disabled = !!actionReason(room, "game_pause");
    renderTimers(room, Date.now());
    if (timerOf(room).status === "running" || clockLive(room))
        ensureLoop();
}
/** React to a new buzz: sound, and the timer start/pause options. */
function onBuzz(room) {
    const buzz = snap === null || snap === void 0 ? void 0 : snap.currentBuzz;
    const key = buzz ? `${buzz.uid}:${buzz.at}` : "";
    if (key && key !== lastBuzzKey && lastBuzzKey !== null) {
        if (flag(room, "buzzSound", true))
            beep();
        const timer = timerOf(room);
        if (flag(room, "timerStartOnBuzz") && timer.status !== "running")
            act("timer_start");
        else if (flag(room, "timerPauseOnBuzz") && timer.status === "running")
            act("timer_pause", { elapsedMs: timerElapsed(room, Date.now()) });
    }
    lastBuzzKey = key || null;
}
// ---------- Wiring ----------
const toggleSetting = (key, fallback = false) => change(key, !flag(shown(), key, fallback));
els.swPoints.addEventListener("click", () => toggleSetting("showPoints", true));
els.swTeams.addEventListener("click", () => toggleSetting("showTeams"));
els.swTimer.addEventListener("click", () => toggleSetting("showTimer", true));
els.swClock.addEventListener("click", () => toggleSetting("showClock"));
els.clear.addEventListener("click", () => act("basic_clear"));
els.lock.addEventListener("click", () => act("basic_lock"));
els.timerStart.addEventListener("click", () => act("timer_start"));
els.timerPause.addEventListener("click", () => act("timer_pause", { elapsedMs: timerElapsed(shown(), Date.now()) }));
els.timerReset.addEventListener("click", () => act("timer_reset"));
els.timerDisplay.addEventListener("click", () => {
    const seconds = parseTime(window.prompt("Set the timer (mm:ss, or seconds)", formatClock(timerOf(shown()).durationMs)));
    if (seconds)
        act("timer_set", { seconds });
});
els.clockStart.addEventListener("click", () => act("game_start"));
els.clockPause.addEventListener("click", () => act("game_pause", { elapsedMs: clockElapsed(shown(), Date.now()) }));
els.clockReset.addEventListener("click", () => act("game_reset"));
els.gameClock.addEventListener("click", () => {
    const seconds = parseTime(window.prompt("Set the game clock (mm:ss, or seconds)", formatClock(gameDurationMs(shown()))));
    if (seconds)
        act("game_set", { seconds });
});
els.settingsBtn.addEventListener("click", () => els.dialog.showModal());
els.endBtn.addEventListener("click", () => { els.endConfirm.hidden = false; els.endConfirmBtn.focus(); });
els.endCancel.addEventListener("click", () => { els.endConfirm.hidden = true; });
els.endConfirmBtn.addEventListener("click", () => {
    els.endConfirm.hidden = true;
    act("end_game", { elapsedMs: clockElapsed(shown(), Date.now()) });
});
els.fullscreen.addEventListener("click", () => {
    var _a, _b, _c;
    if (document.fullscreenElement)
        (_a = document.exitFullscreen) === null || _a === void 0 ? void 0 : _a.call(document);
    else
        (_c = (_b = els.main).requestFullscreen) === null || _c === void 0 ? void 0 : _c.call(_b).catch(() => { });
});
els.copy.addEventListener("click", async () => {
    if (!snap)
        return;
    const link = new URL(`/buzzer-rooms?code=${encodeURIComponent(snap.roomCode)}`, window.location.href).href;
    let copied = false;
    try {
        await navigator.clipboard.writeText(`Join my Atom Bowl game with code ${snap.roomCode}: ${link}`);
        copied = true;
    }
    catch { }
    if (!copied)
        window.prompt("Copy this:", snap.roomCode);
    setText(els.copyLabel, copied ? "Copied" : "Copy");
    if (copied)
        setTimeout(() => setText(els.copyLabel, "Copy"), 1500);
});
document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || els.dialog.open)
        return;
    const active = document.activeElement;
    if (active && (active.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)))
        return;
    if (event.code === "Space") {
        if (active && active.tagName === "BUTTON")
            return;
        event.preventDefault();
        act("basic_lock");
    }
    else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        act("basic_clear");
    }
});
function attach() {
    onSnapshot(doc(db, "rooms", roomId), (snapshot) => {
        if (!snapshot.exists()) {
            snap = null;
            note("This game no longer exists.");
            return;
        }
        const data = snapshot.data();
        if (!isBasic(data)) {
            window.location.replace(`/buzzer-room?roomId=${encodeURIComponent(roomId)}`);
            return;
        }
        if (data.hostUid !== uid) {
            window.location.replace(`/buzzer-room-player?roomId=${encodeURIComponent(roomId)}`);
            return;
        }
        snap = data;
        const live = !snapshot.metadata.fromCache;
        els.statusDot.className = `status-dot ${live ? "live" : "wait"}`;
        setText(els.statusText, live ? "Live" : "Reconnecting");
        pending = pending.filter((op) => { var _a; return !(op.done && (((_a = data.lastAction) === null || _a === void 0 ? void 0 : _a.id) === op.id || Date.now() - op.doneAt > 4000)); });
        onBuzz(shown());
        render();
        firstSnapshot = false;
    }, (err) => note(`Cannot read this game: ${err.message}`));
    onSnapshot(collection(db, "rooms", roomId, "players"), (snapshot) => {
        members = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        if (snap)
            render();
    }, (err) => note(`Cannot read players: ${err.message}`));
}
buildSettings();
(async () => {
    if (!roomId)
        return note("This page needs a game. Create one from Buzzer rooms.");
    uid = (await ensureAnonAuth()).uid;
    attach();
})().catch((err) => note(err.message || "Unable to connect."));
window.addEventListener("pagehide", () => { if (rafId)
    cancelAnimationFrame(rafId); });
//# sourceMappingURL=buzzer_basic.js.map