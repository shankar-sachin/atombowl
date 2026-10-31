// @ts-nocheck
// Create a buzzer room. The room id is its five-character code; the host is the first member.
import { db, ensureAnonAuth } from "./firebase.js";
import "./account_store.js";
import { doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const PROFILE_KEY = "atom_buzzer_profile";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const $ = (id) => document.getElementById(id);
const els = {
  form: $("createForm"), roomName: $("roomName"), hostName: $("hostName"),
  teamCount: $("teamCount"), teamFields: $("teamNameFields"), nsbToggle: $("nsbToggle"), nsbHelp: $("nsbHelp"),
  customTiming: $("customTiming"), tuTime: $("tuTime"), bonusTime: $("bonusTime"), halfMinutes: $("halfMinutes"),
  provideToggle: $("provideToggle"), provideHelp: $("provideHelp"), questionOptions: $("questionOptions"),
  questionLevel: $("questionLevel"),
  create: $("createRoomBtn"), error: $("createError"),
  picker: $("modePicker"), advancedFields: $("advancedFields"),
  lockToggle: $("lockToggle"), lockHelp: $("lockHelp"), autoTimerRow: $("autoTimerRow"), autoTimerToggle: $("autoTimerToggle"),
  questionMode: $("questionMode"), tossupPoints: $("tossupPoints"), bonusPoints: $("bonusPoints"), bonusPointsField: $("bonusPointsField")
};
let mode = "";

const TEAM_NAME_MAX = 20;

function safeParse(raw) {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function clampInt(value, min, max, fallback) {
  const number = parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
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

function buildTeamFields(count) {
  const existing = currentTeamNames();
  els.teamFields.replaceChildren();
  for (const team of teamLetters(count)) {
    const field = document.createElement("div");
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
    field.append(label, input);
    els.teamFields.append(field);
  }
}

els.teamCount.addEventListener("change", () => {
  const count = clampInt(els.teamCount.value, 1, 4, 2);
  buildTeamFields(count);
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

function setProvide(on) {
  els.provideToggle.classList.toggle("on", on);
  els.provideToggle.setAttribute("aria-checked", String(on));
  els.questionOptions.hidden = !on;
  els.autoTimerRow.hidden = !on;
  els.provideHelp.textContent = on
    ? "Questions are read aloud automatically."
    : "Off: you read your own questions.";
}

els.provideToggle.addEventListener("click", () => setProvide(els.provideToggle.getAttribute("aria-checked") !== "true"));

function setSwitch(button, on) {
  button.classList.toggle("on", on);
  button.setAttribute("aria-checked", String(on));
}

els.lockToggle.addEventListener("click", () => {
  const on = els.lockToggle.getAttribute("aria-checked") !== "true";
  setSwitch(els.lockToggle, on);
  els.lockHelp.textContent = on
    ? "On: when the answer time runs out, the toss-up is dead."
    : "Off: buzzers stay open after the timer hits zero until you move on.";
});
els.autoTimerToggle.addEventListener("click", () => setSwitch(els.autoTimerToggle, els.autoTimerToggle.getAttribute("aria-checked") !== "true"));
els.questionMode.addEventListener("change", () => {
  els.bonusPointsField.hidden = els.questionMode.value === "tossup";
});

function chooseMode(next) {
  mode = next;
  els.picker.querySelectorAll("[data-mode]").forEach((card) => card.setAttribute("aria-pressed", String(card.dataset.mode === next)));
  els.form.hidden = false;
  els.advancedFields.hidden = next !== "advanced";
}
els.picker.querySelectorAll("[data-mode]").forEach((card) => card.addEventListener("click", () => chooseMode(card.dataset.mode)));

function generateCode() {
  let out = "";
  for (let i = 0; i < 5; i += 1) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}

async function create(event) {
  event.preventDefault();
  els.error.textContent = "";
  const user = await ensureAnonAuth();
  if (!mode) { els.error.textContent = "Choose Basic or Advanced first."; return; }
  const basic = mode === "basic";
  const teamCount = basic ? 1 : clampInt(els.teamCount.value, 1, 4, 2);
  const useNsb = basic || els.nsbToggle.getAttribute("aria-checked") === "true";
  const tuTime = useNsb ? 5 : clampInt(els.tuTime.value, 1, 300, 5);
  const bonusTime = useNsb ? 20 : clampInt(els.bonusTime.value, 1, 300, 20);
  const halfMinutes = basic ? 8 : clampInt(els.halfMinutes.value, 1, 60, 8);
  const provideQuestions = !basic && els.provideToggle.getAttribute("aria-checked") === "true";
  const questionLevel = els.questionLevel.value === "MS" ? "MS" : "HS";
  const roomName = basic ? "Game" : (els.roomName.value.trim().slice(0, 60) || "Buzzer room");
  const hostName = (basic ? safeParse(localStorage.getItem(PROFILE_KEY))?.name || "" : els.hostName.value).trim().slice(0, 40) || "Host";
  const teamNames = basic ? {} : currentTeamNames();
  const extra = basic
    ? { mode: "basic", showPoints: true, showTeams: false, showTimer: true, showClock: false, plusPoints: 1, minusPoints: 1, timerSeconds: 30 }
    : {
      mode: "advanced",
      lockOnTimerEnd: els.lockToggle.getAttribute("aria-checked") === "true",
      autoStartTimer: els.autoTimerToggle.getAttribute("aria-checked") === "true",
      questionMode: ["tossup", "bonus"].includes(els.questionMode.value) ? els.questionMode.value : "both",
      tossupPoints: clampInt(els.tossupPoints.value, 0, 100, 4),
      bonusPoints: clampInt(els.bonusPoints.value, 0, 100, 10)
    };
  const scores = Object.fromEntries(teamLetters(teamCount).map((team) => [team, 0]));

  els.create.disabled = true;
  try {
    let roomCode = generateCode();
    let created = false;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const roomRef = doc(db, "rooms", roomCode);
      created = await runTransaction(db, async (tx) => {
        if ((await tx.get(roomRef)).exists()) return false;
        tx.set(roomRef, {
          roomCode,
          roomName,
          hostUid: user.uid,
          createdAt: serverTimestamp(),
          status: basic ? "basic" : "lobby",
          locked: basic ? false : null,
          basicTimer: null,
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
          settings: { teamCount, nsbRules: useNsb, tuTime, bonusTime, halfMinutes, teamNames, provideQuestions, questionLevel, ...extra }
        });
        tx.set(doc(db, "rooms", roomCode, "players", user.uid), {
          // The host moderates and doesn't play, so they have no team.
          name: hostName, team: "", joinedAt: serverTimestamp(), isHost: true
        });
        return true;
      });
      if (!created) roomCode = generateCode();
    }
    if (!created) throw new Error("Could not find a free room code. Try again.");

    // Keep the team from the last time they joined as a player.
    const team = safeParse(localStorage.getItem(PROFILE_KEY))?.team || "";
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: hostName, team }));
    localStorage.setItem("atom_buzzer_role", "host");
    if (window.atomAccount?.getUser?.()) window.atomAccount.saveBuzzerProfile({ name: hostName, team }).catch(() => {});
    window.location.href = `/${basic ? "buzzer-basic" : "buzzer-room"}?roomId=${encodeURIComponent(roomCode)}`;
  } catch (err) {
    els.error.textContent = `Could not create the room: ${err.message || "check your connection and try again."}`;
    els.create.disabled = false;
  }
}

els.form.addEventListener("submit", create);

// Start from the saved profile, then the account profile when it loads.
const saved = safeParse(localStorage.getItem(PROFILE_KEY)) || {};
if (saved.name) els.hostName.value = saved.name.slice(0, 40);
buildTeamFields(clampInt(els.teamCount.value, 1, 4, 2));
setNsb(true);

if (window.atomAccount?.onAuthChange) {
  window.atomAccount.onAuthChange(async (user) => {
    if (!user) return;
    try {
      const remote = await window.atomAccount.loadBuzzerProfile();
      if (remote?.name && !els.hostName.value) els.hostName.value = remote.name.slice(0, 40);
    } catch {}
  });
}
