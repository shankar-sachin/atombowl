var _a;
// @ts-nocheck
// Create a buzzer room. The room id is its five-character code; the host is the first member.
import { db, ensureAnonAuth } from "./firebase.js";
import "./account_store.js";
import { doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
const PROFILE_KEY = "atom_buzzer_profile";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const $ = (id) => document.getElementById(id);
const els = {
    form: $("createForm"), roomName: $("roomName"), hostName: $("hostName"), hostTeam: $("hostTeam"),
    teamCount: $("teamCount"), teamFields: $("teamNameFields"), nsbToggle: $("nsbToggle"), nsbHelp: $("nsbHelp"),
    customTiming: $("customTiming"), tuTime: $("tuTime"), bonusTime: $("bonusTime"), halfMinutes: $("halfMinutes"),
    create: $("createRoomBtn"), error: $("createError")
};
const TEAM_NAME_MAX = 20;
let preferredTeam = "";
function safeParse(raw) {
    try {
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
function clampInt(value, min, max, fallback) {
    const number = parseInt(value, 10);
    if (!Number.isFinite(number))
        return fallback;
    return Math.min(max, Math.max(min, number));
}
function teamLetters(count) {
    return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
}
function currentTeamNames() {
    const names = {};
    els.teamFields.querySelectorAll("input[data-team]").forEach((input) => {
        names[input.dataset.team] = input.value.trim().slice(0, TEAM_NAME_MAX) || `Team ${input.dataset.team}`;
    });
    return names;
}
function fillHostTeams(count) {
    const names = currentTeamNames();
    const previous = els.hostTeam.value || preferredTeam;
    els.hostTeam.replaceChildren(...teamLetters(count).map((team) => new Option(names[team] || `Team ${team}`, team)));
    if (previous && teamLetters(count).includes(previous))
        els.hostTeam.value = previous;
}
function buildTeamFields(count) {
    const existing = currentTeamNames();
    els.teamFields.replaceChildren();
    for (const team of teamLetters(count)) {
        const label = document.createElement("label");
        label.className = "label";
        label.htmlFor = `teamName${team}`;
        label.textContent = `Team ${team} name`;
        const input = document.createElement("input");
        input.id = `teamName${team}`;
        input.type = "text";
        input.maxLength = TEAM_NAME_MAX;
        input.dataset.team = team;
        input.placeholder = `Team ${team}`;
        input.value = existing[team] && existing[team] !== `Team ${team}` ? existing[team] : "";
        input.addEventListener("input", () => fillHostTeams(parseInt(els.teamCount.value, 10) || 2));
        els.teamFields.append(label, input);
    }
}
els.teamCount.addEventListener("change", () => {
    const count = clampInt(els.teamCount.value, 2, 4, 2);
    buildTeamFields(count);
    fillHostTeams(count);
});
function setNsb(on) {
    els.nsbToggle.classList.toggle("on", on);
    els.nsbToggle.setAttribute("aria-checked", String(on));
    els.customTiming.hidden = on;
    els.nsbHelp.textContent = on
        ? "5 s toss-ups, 20 s bonuses."
        : "Set your own answer times below.";
}
els.nsbToggle.addEventListener("click", () => setNsb(els.nsbToggle.getAttribute("aria-checked") !== "true"));
function generateCode() {
    let out = "";
    for (let i = 0; i < 5; i += 1)
        out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return out;
}
async function create(event) {
    var _a, _b;
    event.preventDefault();
    els.error.textContent = "";
    const user = await ensureAnonAuth();
    const teamCount = clampInt(els.teamCount.value, 2, 4, 2);
    const useNsb = els.nsbToggle.getAttribute("aria-checked") === "true";
    const tuTime = useNsb ? 5 : clampInt(els.tuTime.value, 1, 300, 5);
    const bonusTime = useNsb ? 20 : clampInt(els.bonusTime.value, 1, 300, 20);
    const halfMinutes = clampInt(els.halfMinutes.value, 1, 60, 8);
    const roomName = els.roomName.value.trim().slice(0, 60) || "Buzzer room";
    const hostName = els.hostName.value.trim().slice(0, 40) || "Host";
    const hostTeam = els.hostTeam.value || "A";
    const teamNames = currentTeamNames();
    const scores = Object.fromEntries(teamLetters(teamCount).map((team) => [team, 0]));
    els.create.disabled = true;
    try {
        let roomCode = generateCode();
        let created = false;
        for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
            const roomRef = doc(db, "rooms", roomCode);
            created = await runTransaction(db, async (tx) => {
                if ((await tx.get(roomRef)).exists())
                    return false;
                tx.set(roomRef, {
                    roomCode,
                    roomName,
                    hostUid: user.uid,
                    createdAt: serverTimestamp(),
                    status: "lobby",
                    currentIndex: 0,
                    currentBuzz: null,
                    scores,
                    timers: null,
                    gameClock: null,
                    lockoutTeam: null,
                    lockoutTeams: [],
                    currentCategory: "General",
                    lastAction: null,
                    log: [],
                    logSeq: 0,
                    stats: {},
                    bonusTeam: "A",
                    settings: { teamCount, nsbRules: useNsb, tuTime, bonusTime, halfMinutes, teamNames }
                });
                tx.set(doc(db, "rooms", roomCode, "players", user.uid), {
                    name: hostName, team: hostTeam, joinedAt: serverTimestamp(), isHost: true
                });
                return true;
            });
            if (!created)
                roomCode = generateCode();
        }
        if (!created)
            throw new Error("Could not find a free room code. Try again.");
        localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: hostName, team: hostTeam }));
        localStorage.setItem("atom_buzzer_role", "host");
        if ((_b = (_a = window.atomAccount) === null || _a === void 0 ? void 0 : _a.getUser) === null || _b === void 0 ? void 0 : _b.call(_a))
            window.atomAccount.saveBuzzerProfile({ name: hostName, team: hostTeam }).catch(() => { });
        window.location.href = `buzzer_room.html?roomId=${encodeURIComponent(roomCode)}`;
    }
    catch (err) {
        els.error.textContent = `Could not create the room: ${err.message || "check your connection and try again."}`;
        els.create.disabled = false;
    }
}
els.form.addEventListener("submit", create);
// Start from the saved profile, then the account profile when it loads.
const saved = safeParse(localStorage.getItem(PROFILE_KEY)) || {};
if (saved.name)
    els.hostName.value = saved.name.slice(0, 40);
if (saved.team)
    preferredTeam = saved.team;
buildTeamFields(clampInt(els.teamCount.value, 2, 4, 2));
fillHostTeams(clampInt(els.teamCount.value, 2, 4, 2));
setNsb(true);
if ((_a = window.atomAccount) === null || _a === void 0 ? void 0 : _a.onAuthChange) {
    window.atomAccount.onAuthChange(async (user) => {
        if (!user)
            return;
        try {
            const remote = await window.atomAccount.loadBuzzerProfile();
            if ((remote === null || remote === void 0 ? void 0 : remote.name) && !els.hostName.value)
                els.hostName.value = remote.name.slice(0, 40);
            if (remote === null || remote === void 0 ? void 0 : remote.team) {
                preferredTeam = remote.team;
                fillHostTeams(clampInt(els.teamCount.value, 2, 4, 2));
            }
        }
        catch { }
    });
}
//# sourceMappingURL=buzzer_create.js.map