// @ts-nocheck
import { sendBuzz, loadMembership } from "./room_store.js";
import { canBuzz } from "./room_state.js";
import { db, ensureAnonAuth } from "./firebase.js";
import {
  doc,
  collection,
  onSnapshot,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const roomTitle = document.getElementById("roomTitle");
const roomCodeTitle = document.getElementById("roomCodeTitle");
const roomStatus = document.getElementById("roomStatus");
const scoreboardHeader = document.getElementById("scoreboardHeader");
const scoreboardPanel = document.getElementById("scoreboardPanel");
const playerList = document.getElementById("playerList");
const questionText = document.getElementById("questionText");
const buzzBtn = document.getElementById("buzzBtn");
const buzzStatus = document.getElementById("buzzStatus");
const statusPill = document.getElementById("statusPill");
const roomCodeValue = document.getElementById("roomCodeValue");
const playerPhaseTimer = document.getElementById("playerPhaseTimer");
const playerGameClock = document.getElementById("playerGameClock");
const toggleLogBtn = document.getElementById("toggleLogBtn");
const playerLogPanel = document.getElementById("playerLogPanel");

let activeRoomId = null;
let roomUnsub = null;
let playerUnsub = null;
let timerInterval = null;
let gameClockInterval = null;
let cachedRoom = null;
let latestPlayers = [];
let playerSynced = false;

const state = {
  uid: null,
  team: "A",
  name: "Player"
};

function getRoomId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("roomId");
}

async function ensureIdentity() {
  const user = await ensureAnonAuth();
  state.uid = user.uid;
  localStorage.setItem("atom_buzzer_role", "player");
  const cached = localStorage.getItem("atom_buzzer_profile");
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      state.name = parsed.name || state.name;
      state.team = parsed.team || state.team;
    } catch {}
  }
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const secs = String(totalSeconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function humanStatus(status) {
  if (status === "tossup_dead") return "Tossup closed. Waiting for the next question.";
  if (status === "lobby") return "Waiting for host.";
  if (status === "tossup_open") return "Tossup open. Anyone can buzz.";
  if (status === "tossup_locked") return "Locked — host grading.";
  if (status === "bonus_ready") return "Bonus ready.";
  if (status === "bonus_open") return "Bonus open — selected team can buzz.";
  if (status === "bonus_locked") return "Bonus locked — host grading.";
  if (status === "ended") return "Game ended.";
  return status || "Waiting.";
}

function updateStatusUI(data) {
  roomStatus.textContent = humanStatus(data.status);
  const isOpen = data.status?.includes("open");
  statusPill.textContent = isOpen ? "OPEN" : "LOCKED";
  statusPill.classList.toggle("open", isOpen);
  statusPill.classList.toggle("locked", !isOpen);
  questionText.textContent = humanStatus(data.status);
  updateBuzzButtonState(data);
}

function updateBuzzButtonState(data) {
  if (!buzzBtn) return;
  const canBuzzNow = playerSynced && canBuzz(data, state);
  buzzBtn.disabled = !canBuzzNow;
  buzzBtn.classList.toggle("buzz-locked", !canBuzzNow);
}

function updateBuzzStatus(data) {
  const buzz = data.currentBuzz;
  if (!buzz) {
    buzzStatus.textContent = "Waiting...";
    return;
  }
  buzzStatus.textContent = `Buzzed: ${buzz.team || "?"}`;
}

function updateScores(scores, teamCount, teamNames) {
  const targets = [scoreboardHeader].filter(Boolean);
  targets.forEach((el) => {
    el.innerHTML = "";
  });
  const keys = Object.keys(scores || {});
  const teams = keys.length ? keys : Array.from({ length: teamCount }, (_, i) => String.fromCharCode(65 + i));
  teams.forEach((team) => {
    const scoreCard = document.createElement("div");
    scoreCard.className = "score";
    const label = document.createElement("span");
    label.textContent = teamNames?.[team] || `Team ${team}`;
    const value = document.createElement("strong");
    value.textContent = scores?.[team] ?? 0;
    scoreCard.appendChild(label);
    scoreCard.appendChild(value);
    targets.forEach((el) => el.appendChild(scoreCard.cloneNode(true)));
  });
}

function updatePlayerScoreboard(stats, players = latestPlayers) {
  if (!scoreboardPanel) return;
  scoreboardPanel.innerHTML = "";
  const statsPlayers = stats?.player || {};
  const merged = (players || []).map((p) => {
    const stat = statsPlayers[p.id] || {};
    return {
      name: p.name || stat.name || "Player",
      team: p.team || stat.team || "?",
      points: stat.points ?? 0
    };
  });
  merged.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  merged.forEach((player) => {
    const card = document.createElement("div");
    card.className = "score";
    const label = document.createElement("span");
    label.textContent = `${player.name || "Player"} (${player.team || "?"})`;
    const value = document.createElement("strong");
    value.textContent = player.points ?? 0;
    card.appendChild(label);
    card.appendChild(value);
    scoreboardPanel.appendChild(card);
  });
}

function renderPlayers(players) {
  playerList.innerHTML = "";
  const sorted = players.sort((a, b) => (a.team || "").localeCompare(b.team || ""));
  sorted.forEach((p) => {
    const card = document.createElement("div");
    card.className = "player-card";
    const left = document.createElement("span");
    left.textContent = p.name || "Player";
    const right = document.createElement("span");
    right.textContent = `${p.team || "?"}${p.isHost ? " · Host" : ""}`;
    card.appendChild(left);
    card.appendChild(right);
    playerList.appendChild(card);
  });
}

function updateLog(log) {
  if (!playerLogPanel) return;
  playerLogPanel.innerHTML = "";
  const entries = (log || []).slice().reverse();
  entries.forEach((item) => {
    const div = document.createElement("div");
    div.className = "log-item";
    const time = new Date(item.at || Date.now()).toLocaleTimeString();
    div.textContent = `[${time}] ${item.details || item.type}`;
    playerLogPanel.appendChild(div);
  });
}

function updateTimers(data) {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const timers = data.timers;
  const tuDefault = formatTime((data.settings?.tuTime || 5) * 1000);
  const bonusDefault = formatTime((data.settings?.bonusTime || 20) * 1000);
  if (!timers || !timers.phaseEndAt) {
    const fallback = data.status?.includes("bonus") ? bonusDefault : tuDefault;
    if (playerPhaseTimer) playerPhaseTimer.textContent = fallback;
    return;
  }
  const end = timers.phaseEndAt;
  const tick = () => {
    const remaining = end - Date.now();
    updateBuzzButtonState(data);
    const formatted = formatTime(remaining);
    if (playerPhaseTimer) playerPhaseTimer.textContent = formatted;
  };
  tick();
  timerInterval = setInterval(tick, 250);
}

function renderGameClock(data) {
  if (gameClockInterval) {
    clearInterval(gameClockInterval);
    gameClockInterval = null;
  }
  const clock = data.gameClock || { status: "stopped", remainingMs: 180000, updatedAt: Date.now() };
  const tick = () => {
    const delta = clock.status === "running" ? Date.now() - clock.updatedAt : 0;
    const remaining = Math.max(0, clock.remainingMs - delta);
    const formatted = formatTime(remaining);
    if (playerGameClock) playerGameClock.textContent = formatted;
  };
  tick();
  gameClockInterval = setInterval(tick, 250);
}

async function enterRoom(roomId) {
  activeRoomId = roomId;
  if (roomUnsub) roomUnsub();
  if (playerUnsub) playerUnsub();
  roomStatus.textContent = "Loading room...";
  const member = await loadMembership(roomId, state.uid);
  if (!member) {
    const room = await getDoc(doc(db, "rooms", roomId));
    if (!room.exists()) throw new Error("Room not found.");
    window.location.replace(`buzzer_rooms.html?code=${encodeURIComponent(room.data().roomCode)}`);
    return;
  }
  state.name = member.name;
  state.team = member.team;
  playerSynced = true;

  roomUnsub = onSnapshot(doc(db, "rooms", roomId), (snap) => {
    if (!snap.exists()) {
      cachedRoom = null;
      buzzBtn.disabled = true;
      if (timerInterval) clearInterval(timerInterval);
      if (gameClockInterval) clearInterval(gameClockInterval);
      roomStatus.textContent = "Room not found.";
      if (roomCodeValue) roomCodeValue.textContent = "-----";
      return;
    }
    const data = snap.data();
    cachedRoom = data;
    roomTitle.textContent = data.roomName || `Room ${data.roomCode}`;
    roomCodeTitle.textContent = `Room ${data.roomCode}`;
    if (roomCodeValue) roomCodeValue.textContent = data.roomCode || "-----";
    updateStatusUI(data);
    updateScores(data.scores || {}, data.settings?.teamCount || 2, data.settings?.teamNames || {});
    updateBuzzStatus(data);
    updateTimers(data);
    renderGameClock(data);
    updateLog(data.log || []);
    updatePlayerScoreboard(data.stats || {});
  }, (err) => {
    console.error("Room snapshot error", err);
    cachedRoom = null;
    buzzBtn.disabled = true;
    roomStatus.textContent = "Room unavailable (check permissions).";
  });

  playerUnsub = onSnapshot(collection(db, "rooms", roomId, "players"), (snap) => {
    const list = [];
    snap.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() });
    });
    latestPlayers = list;
    renderPlayers(list);
    updatePlayerScoreboard(cachedRoom?.stats || {}, list);
  }, (err) => { roomStatus.textContent = "Unable to load players: " + err.message; });
}

let buzzPending = false;
async function buzz() {
  if (!activeRoomId || !playerSynced || buzzPending || !canBuzz(cachedRoom || {}, state)) return;
  buzzPending = true;
  buzzBtn.disabled = true;
  buzzStatus.textContent = "Buzzing...";
  try { await sendBuzz(activeRoomId); }
  catch (err) { buzzStatus.textContent = err.message || "Buzz failed. Check connection/permissions."; }
  finally { buzzPending = false; updateBuzzButtonState(cachedRoom || {}); }
}

function handleSpacebar(e) {
  const tag = document.activeElement?.tagName;
  if (e.repeat || document.activeElement?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag)) return;
  if (e.code === "Space") {
    e.preventDefault();
    buzz();
  }
}

buzzBtn.addEventListener("click", buzz);
document.addEventListener("keydown", handleSpacebar);
if (toggleLogBtn && playerLogPanel) {
  toggleLogBtn.addEventListener("click", () => {
    const isHidden = playerLogPanel.classList.contains("hidden");
    playerLogPanel.classList.toggle("hidden", !isHidden);
    toggleLogBtn.textContent = isHidden ? "Hide Buzz Log" : "Show Buzz Log";
  });
}

(async () => {
  await ensureIdentity();
  const roomId = getRoomId();
  if (!roomId) {
    roomStatus.textContent = "Missing room ID.";
    return;
  }
  await enterRoom(roomId);
})().catch((err) => { roomStatus.textContent = err.message || "Unable to connect to room."; buzzBtn.disabled = true; });



window.addEventListener("pagehide", () => { roomUnsub?.(); playerUnsub?.(); clearInterval(timerInterval); clearInterval(gameClockInterval); });

window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });
