// @ts-nocheck
import { db, ensureAnonAuth } from "./firebase.js";
import "./account_store.js";
import {
  doc,
  collection,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const roomNameInput = document.getElementById("roomName");
const hostNameInput = document.getElementById("hostName");
const teamCountSelect = document.getElementById("teamCount");
const teamNameFields = document.getElementById("teamNameFields");
const hostTeamSelect = document.getElementById("hostTeam");
const nsbRulesCheckbox = document.getElementById("nsbRules");
const advancedSettings = document.getElementById("advancedSettings");
const tuTimeInput = document.getElementById("tuTime");
const bonusTimeInput = document.getElementById("bonusTime");
const createRoomBtn = document.getElementById("createRoomBtn");
const createError = document.getElementById("createError");
const BUZZER_PROFILE_KEY = "atom_buzzer_profile";

let preferredTeam = null;

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function applyPreferredTeam() {
  if (!preferredTeam || !hostTeamSelect) return;
  const match = [...hostTeamSelect.options].some((opt) => opt.value === preferredTeam);
  if (match) hostTeamSelect.value = preferredTeam;
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function buildTeamNameFields(count) {
  teamNameFields.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const team = String.fromCharCode(65 + i);
    const label = document.createElement("label");
    label.className = "label";
    label.textContent = `Team ${team} Name`;
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 20;
    input.value = `Team ${team}`;
    input.dataset.team = team;
    teamNameFields.appendChild(label);
    teamNameFields.appendChild(input);
  }
}

function getTeamNamesFromInputs() {
  const names = {};
  const inputs = teamNameFields.querySelectorAll("input[data-team]");
  inputs.forEach((input) => {
    names[input.dataset.team] = input.value.trim() || `Team ${input.dataset.team}`;
  });
  return names;
}

function buildHostTeamOptions(count, teamNames = {}) {
  hostTeamSelect.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const team = String.fromCharCode(65 + i);
    const opt = document.createElement("option");
    opt.value = team;
    opt.textContent = teamNames[team] || `Team ${team}`;
    hostTeamSelect.appendChild(opt);
  }
}

teamCountSelect.addEventListener("change", () => {
  const count = parseInt(teamCountSelect.value, 10) || 2;
  buildTeamNameFields(count);
  buildHostTeamOptions(count, getTeamNamesFromInputs());
});

buildTeamNameFields(parseInt(teamCountSelect.value, 10) || 2);
buildHostTeamOptions(parseInt(teamCountSelect.value, 10) || 2, getTeamNamesFromInputs());
applyPreferredTeam();

teamNameFields.addEventListener("input", () => {
  const count = parseInt(teamCountSelect.value, 10) || 2;
  const current = hostTeamSelect.value;
  buildHostTeamOptions(count, getTeamNamesFromInputs());
  if (current) hostTeamSelect.value = current;
});

function toggleAdvanced() {
  advancedSettings.classList.toggle("hidden", nsbRulesCheckbox.checked);
}

nsbRulesCheckbox.addEventListener("change", toggleAdvanced);
toggleAdvanced();

const localProfile = safeParse(localStorage.getItem(BUZZER_PROFILE_KEY)) || {};
if (hostNameInput && localProfile?.name) hostNameInput.value = localProfile.name;
if (localProfile?.team) {
  preferredTeam = localProfile.team;
  applyPreferredTeam();
}

if (window.atomAccount?.onAuthChange) {
  window.atomAccount.onAuthChange(async (user) => {
    if (!user) return;
    try {
      const remote = await window.atomAccount.loadBuzzerProfile();
      if (remote?.name && hostNameInput) hostNameInput.value = remote.name;
      if (remote?.team) {
        preferredTeam = remote.team;
        applyPreferredTeam();
      }
    } catch {}
  });
}

async function createRoom() {
  createError.textContent = "";
  const user = await ensureAnonAuth();
  let roomCode = generateRoomCode();
  const teamCount = Math.max(2, Math.min(4, parseInt(teamCountSelect.value, 10) || 2));
  const useNsb = nsbRulesCheckbox.checked;
  const tuTime = useNsb ? 5 : Math.max(1, Math.min(300, parseInt(tuTimeInput.value, 10) || 5));
  const bonusTime = useNsb ? 20 : Math.max(1, Math.min(300, parseInt(bonusTimeInput.value, 10) || 20));
  const roomName = roomNameInput.value.trim().slice(0, 80) || "Buzzer Room";
  const hostName = hostNameInput?.value.trim().slice(0, 40) || "Host";
  const hostTeam = hostTeamSelect?.value || "A";
  const teamNames = getTeamNamesFromInputs();

  let roomId = roomCode;

  const roomData = {
    roomCode,
    roomName,
    hostUid: user.uid,
    createdAt: serverTimestamp(),
    status: "lobby",
    currentIndex: 0,
    currentBuzz: null,
    scores: buildInitialScores(teamCount),
    timers: null,
    lockoutTeam: null,
    lockoutTeams: [],
    currentCategory: null,
    lastAction: null,
    bonusTeam: "A",
    settings: {
      teamCount,
      nsbRules: useNsb,
      tuTime,
      bonusTime,
      teamNames
    }
  };

  let created = false;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    roomId = roomCode;
    const roomRef = doc(db, "rooms", roomId);
    created = await runTransaction(db, async tx => {
      if ((await tx.get(roomRef)).exists()) return false;
      tx.set(roomRef, { ...roomData, roomCode });
      tx.set(doc(db, "rooms", roomId, "players", user.uid), {
        name: hostName, team: hostTeam, joinedAt: serverTimestamp(), isHost: true
      });
      return true;
    });
    if (!created) roomCode = generateRoomCode();
  }
  if (!created) throw new Error("Could not allocate a room code. Try again.");

  localStorage.setItem("atom_buzzer_profile", JSON.stringify({
    name: hostName,
    team: hostTeam
  }));
  localStorage.setItem("atom_buzzer_role", "host");
  if (window.atomAccount?.getUser?.()) {
    window.atomAccount.saveBuzzerProfile({
      name: hostName,
      team: hostTeam
    }).catch(() => {});
  }

  window.location.href = `buzzer_room.html?roomId=${roomId}`;
}

function buildInitialScores(teamCount) {
  const scores = {};
  for (let i = 0; i < teamCount; i += 1) {
    scores[String.fromCharCode(65 + i)] = 0;
  }
  return scores;
}

createRoomBtn.addEventListener("click", () => {
  if (createRoomBtn.disabled) return;
  createRoomBtn.disabled = true;
  createRoom().catch((err) => {
    console.error(err);
    createError.textContent = `Create failed: ${err.message || "Check Firebase permissions and connection."}`;
  }).finally(() => { createRoomBtn.disabled = false; });
});


