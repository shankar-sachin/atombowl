// @ts-nocheck
import { sendBuzz, sendHostAction } from "./room_store.js";
import { canBuzz, buzzKey } from "./room_state.js";
import { db, ensureAnonAuth } from "./firebase.js";
import {
  doc,
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const roomTitle = document.getElementById("roomTitle");
const roomCodeTitle = document.getElementById("roomCodeTitle");
const roomStatus = document.getElementById("roomStatus");
const scoreboardHeader = document.getElementById("scoreboardHeader");
const scoreboardPanel = document.getElementById("scoreboardPanel");
const playerList = document.getElementById("playerList");
const statsTableBody = document.getElementById("statsTableBody");
const questionText = document.getElementById("questionText");
const buzzBtn = document.getElementById("buzzBtn");
const buzzStatus = document.getElementById("buzzStatus");
const statusPill = document.getElementById("statusPill");
const logPanel = document.getElementById("logPanel");
const roomCodeValue = document.getElementById("roomCodeValue");
const copyRoomBtn = document.getElementById("copyRoomBtn");
const joinAsPlayerBtn = document.getElementById("joinAsPlayerBtn");
const playerPhaseTimer = document.getElementById("playerPhaseTimer");
const playerGameClock = document.getElementById("playerGameClock");
const toggleLogBtn = document.getElementById("toggleLogBtn");
const playerLogPanel = document.getElementById("playerLogPanel");

const gameClockDisplay = document.getElementById("gameClockDisplay");
const tossupTimerDisplay = document.getElementById("tossupTimerDisplay");
const bonusTimerDisplay = document.getElementById("bonusTimerDisplay");
const gameStartBtn = document.getElementById("gameStartBtn");
const gamePauseBtn = document.getElementById("gamePauseBtn");
const gameResetBtn = document.getElementById("gameResetBtn");

const startTossupBtn = document.getElementById("startTossupBtn");
const tossupCategory = document.getElementById("tossupCategory");
const tossupInterruptBtn = document.getElementById("tossupInterruptBtn");
const tossupCorrectBtn = document.getElementById("tossupCorrectBtn");
const tossupWrongBtn = document.getElementById("tossupWrongBtn");
const tossupDeadBtn = document.getElementById("tossupDeadBtn");
const startBonusBtn = document.getElementById("startBonusBtn");
const bonusCorrectBtn = document.getElementById("bonusCorrectBtn");
const bonusWrongBtn = document.getElementById("bonusWrongBtn");
const nextTossupBtn = document.getElementById("nextTossupBtn");
const bonusTeamSelect = document.getElementById("bonusTeamSelect");
const exportBtn = document.getElementById("exportBtn");
const hostNote = document.getElementById("hostNote");

let activeRoomId = null;
let roomUnsub = null;
let playerUnsub = null;
let timerInterval = null;
let gameClockInterval = null;
let cachedRoom = null;
let activeRoomCode = "";
let latestPlayers = [];

const state = {
  uid: null,
  team: "A",
  name: "Player",
  isHost: false,
  isRoomHost: false
};

function getRoomId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("roomId");
}

async function ensureIdentity() {
  const user = await ensureAnonAuth();
  state.uid = user.uid;
  const cached = localStorage.getItem("atom_buzzer_profile");
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      state.name = parsed.name || state.name;
      state.team = parsed.team || state.team;
    } catch {}
  }
}

function setHostVisible(isHost) {
  state.isHost = isHost;
  const effectiveHost = isHost;
  if (isHost) {
    localStorage.setItem("atom_buzzer_role", "host");
  }
  document.body.classList.toggle("is-host", effectiveHost);
  document.body.classList.toggle("is-player", !effectiveHost);
  state.isHost = effectiveHost;
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
  if (status === "bonus_ready") return "Bonus ready — select team and start.";
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
  const canBuzzNow = !state.isHost && canBuzz(data, state);
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

function updatePlayerStats(stats) {
  statsTableBody.innerHTML = "";
  const entries = Object.entries(stats?.player || {});
  entries.sort((a, b) => (a[1].name || "").localeCompare(b[1].name || ""));
  entries.forEach(([uid, data]) => {
    const row = document.createElement("tr");
    for (const value of [data.name || uid.slice(0, 6), data.team || "?", data.correct || 0, data.incorrect || 0, data.interrupt || 0, data.buzzes || 0]) {
      const cell = document.createElement("td"); cell.textContent = String(value); row.appendChild(cell);
    }
    statsTableBody.appendChild(row);
  });
}

function updateLog(log) {
  logPanel.innerHTML = "";
  const entries = (log || []).slice().reverse();
  entries.forEach((item) => {
    const div = document.createElement("div");
    div.className = "log-item";
    const time = new Date(item.at || Date.now()).toLocaleTimeString();
    div.textContent = `[${time}] ${item.details || item.type}`;
    logPanel.appendChild(div);
  });

  if (playerLogPanel) {
    playerLogPanel.innerHTML = "";
    entries.forEach((item) => {
      const div = document.createElement("div");
      div.className = "log-item";
      const time = new Date(item.at || Date.now()).toLocaleTimeString();
      div.textContent = `[${time}] ${item.details || item.type}`;
      playerLogPanel.appendChild(div);
    });
  }
}

function updateTimers(data) {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const timers = data.timers;
  if (!timers || !timers.phaseEndAt) {
    const tuDefault = formatTime((data.settings?.tuTime || 5) * 1000);
    const bonusDefault = formatTime((data.settings?.bonusTime || 20) * 1000);
    tossupTimerDisplay.textContent = tuDefault;
    bonusTimerDisplay.textContent = bonusDefault;
    if (playerPhaseTimer) playerPhaseTimer.textContent = tuDefault;
    return;
  }
  const end = timers.phaseEndAt;
  const target = timers.phaseType === "bonus" ? bonusTimerDisplay : tossupTimerDisplay;
  const tick = () => {
    const remaining = end - Date.now();
    updateBuzzButtonState(data);
    const formatted = formatTime(remaining);
    target.textContent = formatted;
    if (playerPhaseTimer) playerPhaseTimer.textContent = formatted;
    if (remaining <= 0 && state.isHost && ["bonus_open", "tossup_open"].includes(data.status)) {
      hostAction(() => sendHostAction(activeRoomId, "expire"));
    }
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
    gameClockDisplay.textContent = formatted;
    if (playerGameClock) playerGameClock.textContent = formatted;
  };
  tick();
  gameClockInterval = setInterval(tick, 250);
}

function buildBonusTeamOptions(teamCount, teamNames) {
  bonusTeamSelect.innerHTML = "";
  for (let i = 0; i < teamCount; i += 1) {
    const team = String.fromCharCode(65 + i);
    const opt = document.createElement("option");
    opt.value = team;
    opt.textContent = teamNames?.[team] || `Team ${team}`;
    bonusTeamSelect.appendChild(opt);
  }
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

async function enterRoom(roomId) {
  activeRoomId = roomId;
  if (roomUnsub) roomUnsub();
  if (playerUnsub) playerUnsub();
  roomStatus.textContent = "Loading room...";

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
    setHostVisible(data.hostUid === state.uid);
    if (data.hostUid !== state.uid) { window.location.replace(`buzzer_room_player.html?roomId=${encodeURIComponent(roomId)}`); return; }
    roomTitle.textContent = data.roomName || `Room ${data.roomCode}`;
    roomCodeTitle.textContent = `Room ${data.roomCode}`;
    activeRoomCode = data.roomCode || "";
    if (roomCodeValue) roomCodeValue.textContent = data.roomCode || "-----";
    if (data.currentBuzz && data.stats?.lastBuzz !== buzzKey(data)) {
      sendHostAction(activeRoomId, "record_buzz").catch(err => { hostNote.textContent = "Unable to record buzz: " + err.message; });
    }
    updateStatusUI(data);
    updateScores(data.scores || {}, data.settings?.teamCount || 2, data.settings?.teamNames || {});
    updateBuzzStatus(data);
    updateTimers(data);
    renderGameClock(data);
    state.isRoomHost = data.hostUid === state.uid;
    updateLog(data.log || []);
    updatePlayerStats(data.stats || {});
    updatePlayerScoreboard(data.stats || {});
    buildBonusTeamOptions(data.settings?.teamCount || 2, data.settings?.teamNames || {});
    if (data.bonusTeam) bonusTeamSelect.value = data.bonusTeam;
    setHostVisible(data.hostUid === state.uid);
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

const startTossup = () => sendHostAction(activeRoomId, "tossup_start", { category: tossupCategory?.value });
const startBonusTimer = () => sendHostAction(activeRoomId, "bonus_start", { team: bonusTeamSelect.value });
const gradeTossup = (kind) => sendHostAction(activeRoomId, `tossup_grade_${kind}`);
const markTossupDead = () => sendHostAction(activeRoomId, "tossup_dead");
const gradeBonus = (correct) => sendHostAction(activeRoomId, correct ? "bonus_correct" : "bonus_wrong");
const nextTossup = () => sendHostAction(activeRoomId, "next_tossup");
const updateGameClockAction = (action) => hostAction(() => sendHostAction(activeRoomId, `game_${action}`));
async function buzz() {
  if (state.isHost || !activeRoomId) return;
  try { await sendBuzz(activeRoomId); }
  catch (err) { buzzStatus.textContent = err.message || "Buzz failed."; }
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function exportCsv() {
  if (!cachedRoom) return;
  const lines = [];
  const teamNames = cachedRoom.settings?.teamNames || {};
  lines.push("Team,Score,Correct,Incorrect,Interrupt,Buzzes");
  Object.entries(cachedRoom.scores || {}).forEach(([team, score]) => {
    const stats = cachedRoom.stats?.team?.[team] || {};
    lines.push([
      teamNames[team] || `Team ${team}`,
      score,
      stats.correct || 0,
      stats.incorrect || 0,
      stats.interrupt || 0,
      stats.buzzes || 0
    ].map(csvCell).join(","));
  });
  lines.push("");
  lines.push("Player,Team,Correct,Incorrect,Interrupt,Buzzes");
  Object.values(cachedRoom.stats?.player || {}).forEach((p) => {
    lines.push([p.name, p.team, p.correct || 0, p.incorrect || 0, p.interrupt || 0, p.buzzes || 0].map(csvCell).join(","));
  });
  lines.push("");
  lines.push("Log");
  (cachedRoom.log || []).forEach((item) => {
    lines.push(csvCell(`${new Date(item.at || Date.now()).toISOString()} - ${item.details || item.type}`));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "atom-bowl-room.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function handleSpacebar(e) {
  const tag = document.activeElement?.tagName;
  if (e.repeat || document.activeElement?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag)) return;
  if (e.code === "Space") {
    e.preventDefault();
    buzz();
  }
}

let hostBusy = false;
function hostAction(fn) {
  if (hostBusy) return Promise.resolve();
  hostBusy = true;
  return Promise.resolve().then(fn)
    .then(() => {
      if (hostNote) hostNote.textContent = "";
    })
    .catch((err) => {
      console.error(err);
      if (hostNote) {
        const msg = err?.message ? ` (${err.message})` : "";
        hostNote.textContent = `Host action failed. Make sure you're the room host on this device.${msg}`;
      }
    }).finally(() => { hostBusy = false; });
}

startTossupBtn.addEventListener("click", () => hostAction(startTossup));
tossupInterruptBtn.addEventListener("click", () => hostAction(() => gradeTossup("interrupt")));
tossupCorrectBtn.addEventListener("click", () => hostAction(() => gradeTossup("correct")));
tossupWrongBtn.addEventListener("click", () => hostAction(() => gradeTossup("incorrect")));
tossupDeadBtn.addEventListener("click", () => hostAction(markTossupDead));
startBonusBtn.addEventListener("click", () => hostAction(startBonusTimer));
bonusCorrectBtn.addEventListener("click", () => hostAction(() => gradeBonus(true)));
bonusWrongBtn.addEventListener("click", () => hostAction(() => gradeBonus(false)));
nextTossupBtn.addEventListener("click", () => hostAction(nextTossup));
buzzBtn.addEventListener("click", buzz);
bonusTeamSelect.addEventListener("change", () => hostAction(() => sendHostAction(activeRoomId, "bonus_team", { team: bonusTeamSelect.value })));
gameStartBtn.addEventListener("click", () => updateGameClockAction("start").catch(console.error));
gamePauseBtn.addEventListener("click", () => updateGameClockAction("pause").catch(console.error));
gameResetBtn.addEventListener("click", () => updateGameClockAction("reset").catch(console.error));
exportBtn.addEventListener("click", exportCsv);
document.addEventListener("keydown", handleSpacebar);
if (copyRoomBtn) {
  copyRoomBtn.addEventListener("click", async () => {
    if (!activeRoomId) return;
    const roomCode = activeRoomCode || "Code";
    const joinLink = new URL(`buzzer_rooms.html?code=${encodeURIComponent(activeRoomCode)}`, window.location.href).href;
    const text = [
      "You have been invited to an Atom Bowl Buzzing Room.",
      `Join here: ${joinLink}`,
      `and the code: "${roomCode}"`,
      `and a direct link: ${joinLink}`
    ].join(" ");
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {}
    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        copied = document.execCommand("copy");
      } catch {}
      textarea.remove();
    }
    if (copied) {
      copyRoomBtn.textContent = "Copied!";
      setTimeout(() => {
        copyRoomBtn.textContent = "Copy Invite";
      }, 1500);
    } else {
      window.prompt("Copy this invite message:", text);
    }
  });
}
if (joinAsPlayerBtn) {
  joinAsPlayerBtn.addEventListener("click", () => {
    if (!activeRoomId) return;
    localStorage.setItem("atom_buzzer_role", "player");
    const joinLink = `buzzer_room_player.html?roomId=${activeRoomId}`;
    window.open(joinLink, "_blank");
  });
}
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
})().catch((err) => { roomStatus.textContent = err.message || "Unable to connect to room."; });



window.addEventListener("pagehide", () => { roomUnsub?.(); playerUnsub?.(); clearInterval(timerInterval); clearInterval(gameClockInterval); });

window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });
