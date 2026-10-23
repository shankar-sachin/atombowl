// Pure buzzer-room state machine (NSB flow). No Firebase imports: everything here is
// deterministic given (room, action, options, now) so it can run optimistically in the
// browser, inside a Firestore transaction, and in node tests.
//
// Statuses:
//   lobby -> tossup_reading (buzzers open, no timer; a buzz here is an interrupt)
//   tossup_reading --done_reading--> tossup_open (answer timer running)
//   tossup_reading|tossup_open --buzz--> tossup_locked
//   tossup_locked --correct--> bonus_ready --bonus_start--> bonus_open (--buzz/expire--> bonus_locked)
//   bonus_* --bonus_correct|bonus_wrong--> between --tossup_start--> tossup_reading ...
//   tossup_locked --incorrect--> tossup_open (fresh timer) | tossup_reading (after an interrupt) | tossup_dead
//   any --end_game--> ended
/** Placeholder the store swaps for serverTimestamp() before writing. */
export const SERVER_TIME = "__server_time__";
export const LOG_LIMIT = 60;
export const BUZZ_STATUSES = ["tossup_reading", "tossup_open", "bonus_open"];
export const HOST_ACTIONS = [
    "tossup_start", "done_reading", "tossup_grade_correct", "tossup_grade_incorrect", "tossup_dead",
    "next_tossup", "bonus_start", "bonus_team", "bonus_correct", "bonus_wrong", "set_category",
    "adjust_score", "end_game", "game_start", "game_pause", "game_reset"
];
const has = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);
const clone = (value) => JSON.parse(JSON.stringify(value !== null && value !== void 0 ? value : null));
export function timeMillis(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (value && typeof value.toMillis === "function")
        return value.toMillis();
    return null;
}
export function teamIds(room) {
    return Object.keys((room === null || room === void 0 ? void 0 : room.scores) || {}).sort();
}
export function teamName(room, team) {
    var _a, _b;
    const name = (_b = (_a = room === null || room === void 0 ? void 0 : room.settings) === null || _a === void 0 ? void 0 : _a.teamNames) === null || _b === void 0 ? void 0 : _b[team];
    return typeof name === "string" && name.trim() ? name.trim() : `Team ${team}`;
}
export function tossupSeconds(room) {
    var _a, _b;
    return ((_a = room === null || room === void 0 ? void 0 : room.settings) === null || _a === void 0 ? void 0 : _a.nsbRules) ? 5 : (Number((_b = room === null || room === void 0 ? void 0 : room.settings) === null || _b === void 0 ? void 0 : _b.tuTime) || 5);
}
export function bonusSeconds(room) {
    var _a, _b;
    return ((_a = room === null || room === void 0 ? void 0 : room.settings) === null || _a === void 0 ? void 0 : _a.nsbRules) ? 20 : (Number((_b = room === null || room === void 0 ? void 0 : room.settings) === null || _b === void 0 ? void 0 : _b.bonusTime) || 20);
}
export function halfMs(room) {
    var _a;
    return (Number((_a = room === null || room === void 0 ? void 0 : room.settings) === null || _a === void 0 ? void 0 : _a.halfMinutes) || 8) * 60000;
}
/** When the current phase timer runs out, counted from `seenAt` (local receipt time) when given. */
export function phaseDeadline(room, seenAt) {
    const timers = room === null || room === void 0 ? void 0 : room.timers;
    if (!timers || !(timers.phaseDuration > 0))
        return null;
    const start = typeof seenAt === "number" ? seenAt : timeMillis(timers.phaseStartedAt);
    return start == null ? null : start + timers.phaseDuration * 1000;
}
export function gameClockOf(room) {
    const clock = room === null || room === void 0 ? void 0 : room.gameClock;
    if (clock && typeof clock.remainingMs === "number")
        return clock;
    return { status: "stopped", remainingMs: halfMs(room), startedAt: null, runKey: null };
}
/** Remaining game-clock time given how long the current run has been observed. */
export function clockRemaining(room, elapsedMs = 0) {
    const clock = gameClockOf(room);
    if (clock.status !== "running")
        return Math.max(0, clock.remainingMs);
    return Math.max(0, clock.remainingMs - Math.max(0, elapsedMs));
}
/** Why `player` cannot buzz right now, or "" when they can. */
export function buzzReason(room, player, now = Date.now(), seenAt) {
    if (!room)
        return "The room is still loading.";
    if (!(player === null || player === void 0 ? void 0 : player.uid))
        return "Join this room before buzzing.";
    if (!has(room.scores, player.team))
        return "Your team is not part of this room.";
    const buzz = room.currentBuzz;
    if (buzz)
        return buzz.uid === player.uid ? "You already buzzed." : `${teamName(room, buzz.team)} (${buzz.name}) buzzed first.`;
    if (!BUZZ_STATUSES.includes(room.status))
        return "Buzzers are closed.";
    if (room.status === "bonus_open" && room.bonusTeam !== player.team)
        return `This bonus belongs to ${teamName(room, room.bonusTeam)}.`;
    if (room.status !== "bonus_open" && (room.lockoutTeams || []).includes(player.team))
        return "Your team is locked out of this toss-up.";
    const deadline = phaseDeadline(room, seenAt);
    if (deadline != null && now >= deadline)
        return "Time is up.";
    return "";
}
export function canBuzz(room, player, now = Date.now(), seenAt) {
    return !buzzReason(room, player, now, seenAt);
}
/** A buzz is a plain update; Firestore rules make sure only the first one lands. */
export function buzzPatch(room, player, now = Date.now(), seenAt) {
    const reason = buzzReason(room, player, now, seenAt);
    if (reason)
        throw new Error(reason);
    return {
        currentBuzz: { uid: player.uid, name: player.name, team: player.team, at: now, interrupt: room.status === "tossup_reading" },
        status: room.status === "bonus_open" ? "bonus_locked" : "tossup_locked",
        timers: null
    };
}
/** Replace SERVER_TIME markers (for the store: serverTimestamp(); for tests: a number). */
export function materialize(patch, value) {
    const out = { ...patch };
    if (out.timers && out.timers.phaseStartedAt === SERVER_TIME)
        out.timers = { ...out.timers, phaseStartedAt: value };
    if (out.gameClock && out.gameClock.startedAt === SERVER_TIME)
        out.gameClock = { ...out.gameClock, startedAt: value };
    return out;
}
function pendingBuzz(room) {
    const buzz = room.currentBuzz;
    return buzz ? `Grade ${buzz.name}'s buzz first.` : "";
}
/** Why the host cannot run `action` now, or "" when it is allowed. */
export function actionReason(room, action, options = {}) {
    const status = (room === null || room === void 0 ? void 0 : room.status) || "lobby";
    const teams = teamIds(room);
    if (status === "ended" && action !== "adjust_score")
        return "The game has ended.";
    switch (action) {
        case "tossup_start":
        case "next_tossup":
            if (status === "tossup_locked")
                return pendingBuzz(room) || "Grade the buzz first.";
            if (["lobby", "between", "tossup_dead"].includes(status))
                return "";
            if (status.startsWith("bonus"))
                return "Mark the bonus correct or incorrect first.";
            return "A toss-up is already in progress. Mark it dead to skip it.";
        case "done_reading":
            if (status === "tossup_reading")
                return "";
            if (status === "tossup_open")
                return "The answer timer is already running.";
            if (status === "tossup_locked")
                return pendingBuzz(room);
            return "Start a toss-up first.";
        case "tossup_grade_correct":
        case "tossup_grade_incorrect":
            return status === "tossup_locked" && room.currentBuzz ? "" : "There is no toss-up buzz to grade.";
        case "tossup_dead":
            if (status === "tossup_locked")
                return pendingBuzz(room) || "Grade the buzz first.";
            return ["tossup_reading", "tossup_open"].includes(status) ? "" : "There is no live toss-up.";
        case "bonus_start": {
            if (status !== "bonus_ready")
                return status.startsWith("bonus") ? "The bonus timer has already started." : "Award a correct toss-up first.";
            const team = options.team || room.bonusTeam;
            return teams.includes(team) ? "" : "Choose a valid bonus team.";
        }
        case "bonus_team":
            if (status !== "bonus_ready")
                return "The bonus team can only change before the bonus timer starts.";
            return teams.includes(options.team) ? "" : "Choose a valid bonus team.";
        case "bonus_correct":
        case "bonus_wrong":
            return ["bonus_ready", "bonus_open", "bonus_locked"].includes(status) ? "" : "There is no bonus to grade.";
        case "set_category":
            return typeof options.category === "string" && options.category.trim() ? "" : "Choose a category.";
        case "adjust_score": {
            const delta = Number(options.delta);
            if (!teams.includes(options.team))
                return "Choose a team to adjust.";
            return Number.isInteger(delta) && delta !== 0 && Math.abs(delta) <= 100 ? "" : "Adjust by a whole number between -100 and 100.";
        }
        case "end_game":
            return "";
        case "game_start": {
            const clock = gameClockOf(room);
            if (clock.status === "running")
                return "The game clock is already running.";
            return clock.remainingMs > 0 ? "" : "Reset the game clock first.";
        }
        case "game_pause":
            return gameClockOf(room).status === "running" ? "" : "The game clock is not running.";
        case "game_reset":
            return "";
        default:
            return "Unknown room action.";
    }
}
/** Enabled/disabled state (with the reason) for every host control. */
export function availableActions(room) {
    const sample = {
        adjust_score: { team: teamIds(room)[0], delta: 1 },
        bonus_team: { team: (room === null || room === void 0 ? void 0 : room.bonusTeam) || teamIds(room)[0] },
        set_category: { category: "General" }
    };
    const out = {};
    for (const action of HOST_ACTIONS) {
        const reason = room ? actionReason(room, action, sample[action] || {}) : "The room is still loading.";
        out[action] = { ok: !reason, reason };
    }
    return out;
}
function blankStat() {
    return { correct: 0, incorrect: 0, interrupt: 0, buzzes: 0, points: 0 };
}
function tallyBuzz(room, kind, points) {
    const stats = clone(room.stats) || {};
    stats.team || (stats.team = {});
    stats.player || (stats.player = {});
    delete stats.lastBuzz;
    const buzz = room.currentBuzz;
    for (const [bucket, key] of [[stats.team, buzz.team], [stats.player, buzz.uid]]) {
        const value = bucket[key] || (bucket[key] = blankStat());
        value.buzzes = (value.buzzes || 0) + 1;
        value[kind] = (value[kind] || 0) + 1;
        value.points = (value.points || 0) + points;
    }
    Object.assign(stats.player[buzz.uid], { name: buzz.name, team: buzz.team });
    return stats;
}
function addTeamPoints(stats, team, points, field = "") {
    var _a;
    stats.team || (stats.team = {});
    const value = (_a = stats.team)[team] || (_a[team] = blankStat());
    value.points = (value.points || 0) + points;
    if (field)
        value[field] = (value[field] || 0) + 1;
    return stats;
}
function cleanCategory(value) {
    return typeof value === "string" ? value.trim().slice(0, 40) : "";
}
function signed(n) {
    return n > 0 ? `+${n}` : String(n);
}
/**
 * The update the host's action makes to `room`. Returns {} for a no-op (stale expiry).
 * options.opId names the change (it becomes lastAction.id and the phase/run key) so the
 * optimistic copy and the transaction produce identical documents.
 */
export function hostPatch(room, uid, action, options = {}, now = Date.now()) {
    var _a;
    var _b, _c;
    if (!room || room.hostUid !== uid)
        throw new Error("Only the room host can do that.");
    const status = room.status || "lobby";
    const id = String(options.opId || `${action}-${now}`);
    const timer = (type, seconds) => ({ phaseStartedAt: SERVER_TIME, phaseDuration: seconds, phaseType: type, phaseKey: id });
    const index = room.currentIndex || 0;
    let patch;
    let details;
    // Expiry is fired by a host countdown; when the phase already moved on it is a silent no-op.
    if (action === "expire") {
        if (!room.timers || room.timers.phaseKey !== options.phaseKey || room.currentBuzz
            || !["tossup_open", "bonus_open"].includes(status))
            return {};
        patch = status === "bonus_open" ? { status: "bonus_locked", timers: null } : { status: "tossup_dead", timers: null };
        details = status === "bonus_open" ? "Time on the bonus" : `Time. Toss-up ${index} is dead`;
        return finish(room, patch, action, id, now, details);
    }
    if (action === "game_expire") {
        const clock = gameClockOf(room);
        if (clock.status !== "running" || clock.runKey !== options.runKey)
            return {};
        return finish(room, { gameClock: { status: "done", remainingMs: 0, startedAt: null, runKey: null } }, action, id, now, "End of the half");
    }
    const reason = actionReason(room, action, options);
    if (reason)
        throw new Error(reason);
    const scores = { ...(room.scores || {}) };
    const buzz = room.currentBuzz;
    const who = buzz ? `${buzz.name} (${teamName(room, buzz.team)})` : "";
    switch (action) {
        case "tossup_start":
        case "next_tossup": {
            const next = index + 1;
            const category = cleanCategory(options.category) || room.currentCategory || "General";
            patch = { status: "tossup_reading", currentIndex: next, currentCategory: category, currentBuzz: null,
                lockoutTeam: null, lockoutTeams: [], timers: null };
            details = `Toss-up ${next} started: ${category}`;
            break;
        }
        case "done_reading": {
            const seconds = tossupSeconds(room);
            patch = { status: "tossup_open", timers: timer("tossup", seconds) };
            details = `Toss-up ${index} read, ${seconds} s to buzz`;
            break;
        }
        case "tossup_grade_correct": {
            scores[buzz.team] = (scores[buzz.team] || 0) + 4;
            patch = { scores, stats: tallyBuzz(room, "correct", 4), currentBuzz: null, status: "bonus_ready",
                bonusTeam: buzz.team, lockoutTeam: null, lockoutTeams: [], timers: null };
            details = `${who} correct${buzz.interrupt ? " on an interrupt" : ""}, +4`;
            break;
        }
        case "tossup_grade_incorrect": {
            const teams = teamIds(room);
            const locked = [...new Set([...(room.lockoutTeams || []), buzz.team])];
            const finished = teams.every(team => locked.includes(team));
            let stats;
            if (buzz.interrupt && teams.length === 2) {
                const opponent = teams.find(team => team !== buzz.team);
                scores[opponent] = (scores[opponent] || 0) + 4;
                stats = addTeamPoints(tallyBuzz(room, "interrupt", 0), opponent, 4);
                details = `${who} interrupted incorrectly, +4 to ${teamName(room, opponent)}`;
            }
            else if (buzz.interrupt) {
                scores[buzz.team] = (scores[buzz.team] || 0) - 4;
                stats = tallyBuzz(room, "interrupt", -4);
                details = `${who} interrupted incorrectly, -4`;
            }
            else {
                stats = tallyBuzz(room, "incorrect", 0);
                details = `${who} incorrect`;
            }
            // After an interrupt the question is read again for the other teams; otherwise they get a fresh timer.
            const nextStatus = finished ? "tossup_dead" : buzz.interrupt ? "tossup_reading" : "tossup_open";
            patch = { scores, stats, currentBuzz: null, status: nextStatus, lockoutTeam: buzz.team, lockoutTeams: locked,
                timers: nextStatus === "tossup_open" ? timer("tossup", tossupSeconds(room)) : null };
            if (finished)
                details += `. Toss-up ${index} is dead`;
            break;
        }
        case "tossup_dead":
            patch = { status: "tossup_dead", timers: null, currentBuzz: null };
            details = `Toss-up ${index} is dead`;
            break;
        case "bonus_start": {
            const team = options.team || room.bonusTeam;
            patch = { status: "bonus_open", bonusTeam: team, currentBuzz: null, timers: timer("bonus", bonusSeconds(room)) };
            details = `Bonus timer started for ${teamName(room, team)}`;
            break;
        }
        case "bonus_team":
            patch = { bonusTeam: options.team };
            details = `Bonus goes to ${teamName(room, options.team)}`;
            break;
        case "bonus_correct":
        case "bonus_wrong": {
            const team = room.bonusTeam;
            const points = action === "bonus_correct" ? 10 : 0;
            scores[team] = (scores[team] || 0) + points;
            const stats = addTeamPoints(clone(room.stats) || {}, team, points, points ? "bonusCorrect" : "bonusMissed");
            if (buzz && points) {
                stats.player || (stats.player = {});
                const value = (_b = stats.player)[_c = buzz.uid] || (_b[_c] = { ...blankStat(), name: buzz.name, team: buzz.team });
                value.points = (value.points || 0) + points;
            }
            patch = { scores, stats, status: "between", currentBuzz: null, timers: null, lockoutTeam: null, lockoutTeams: [] };
            details = `${teamName(room, team)} bonus ${points ? "correct, +10" : "incorrect"}`;
            break;
        }
        case "set_category": {
            const category = cleanCategory(options.category);
            patch = { currentCategory: category };
            details = `Category: ${category}`;
            break;
        }
        case "adjust_score": {
            const delta = Number(options.delta);
            scores[options.team] = (scores[options.team] || 0) + delta;
            patch = { scores };
            details = `Score correction: ${teamName(room, options.team)} ${signed(delta)}`;
            break;
        }
        case "end_game": {
            const clock = gameClockOf(room);
            const remaining = clock.status === "running" ? clockRemaining(room, Number(options.elapsedMs) || 0) : clock.remainingMs;
            patch = { status: "ended", currentBuzz: null, timers: null,
                gameClock: { status: clock.status === "running" ? "paused" : clock.status, remainingMs: remaining, startedAt: null, runKey: null } };
            details = `Game over. ${teamIds(room).map(team => `${teamName(room, team)} ${scores[team] || 0}`).join(", ")}`;
            break;
        }
        case "game_start":
            patch = { gameClock: { status: "running", remainingMs: gameClockOf(room).remainingMs, startedAt: SERVER_TIME, runKey: id } };
            details = "Game clock started";
            break;
        case "game_pause": {
            const clock = gameClockOf(room);
            const elapsed = typeof options.elapsedMs === "number" ? options.elapsedMs : now - ((_a = timeMillis(clock.startedAt)) !== null && _a !== void 0 ? _a : now);
            patch = { gameClock: { status: "paused", remainingMs: clockRemaining(room, elapsed), startedAt: null, runKey: null } };
            details = "Game clock paused";
            break;
        }
        case "game_reset":
            patch = { gameClock: { status: "stopped", remainingMs: halfMs(room), startedAt: null, runKey: null } };
            details = "Game clock reset";
            break;
        default:
            throw new Error("Unknown room action.");
    }
    return finish(room, patch, action, id, now, details);
}
function finish(room, patch, action, id, now, details) {
    const seq = (room.logSeq || 0) + 1;
    const entry = { id, seq, type: action, at: now, details };
    return { ...patch, lastAction: entry, logSeq: seq, log: [...(room.log || []), entry].slice(-LOG_LIMIT) };
}
// ---- Display helpers shared by the host and player pages (pure, no DOM) ----
export const CATEGORIES = ["General", "Biology", "Chemistry", "Earth and space", "Energy", "Math", "Physics", "Computer science"];
/** Sentence case for stored category text, e.g. "PHYSICS" -> "Physics". */
export function sentenceCase(text) {
    const value = String(text !== null && text !== void 0 ? text : "").trim().toLowerCase();
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}
/** The one-line state for the console, e.g. "Tossup 7, reading". */
export function stateLine(room) {
    const status = (room === null || room === void 0 ? void 0 : room.status) || "lobby";
    const n = (room === null || room === void 0 ? void 0 : room.currentIndex) || 0;
    switch (status) {
        case "lobby": return "Ready to start";
        case "tossup_reading": return `Tossup ${n}, reading`;
        case "tossup_open": return `Tossup ${n}, buzzers open`;
        case "tossup_locked": return `Tossup ${n}, buzz to grade`;
        case "tossup_dead": return `Tossup ${n}, dead`;
        case "bonus_ready": return `Bonus ${n}, ready`;
        case "bonus_open": return `Bonus ${n}, timer running`;
        case "bonus_locked": return `Bonus ${n}, answer to grade`;
        case "between": return `Ready for tossup ${n + 1}`;
        case "ended": return "Game over";
        default: return sentenceCase(status);
    }
}
/** Whole seconds, rounded up, for phase timers: 5, 4, ... 0. */
export function formatSeconds(ms) {
    return String(Math.max(0, Math.ceil(ms / 1000)));
}
/** mm:ss for the game clock. */
export function formatClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
/** CSS class for a team's colour token, e.g. "B" -> "team-b". */
export function teamClass(team) {
    return `team-${String(team || "a").toLowerCase()}`;
}
/** Whether the phase timer counts down (toss-up or bonus answer time). */
export function timedPhase(room) {
    return !!(room === null || room === void 0 ? void 0 : room.timers) && room.timers.phaseDuration > 0 && (room.status === "tossup_open" || room.status === "bonus_open");
}
/** Whether the game clock is counting down. */
export function clockRunning(room) {
    return gameClockOf(room).status === "running";
}
//# sourceMappingURL=room_state.js.map