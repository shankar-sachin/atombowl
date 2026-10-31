// @ts-nocheck
// Join a buzzer room by its code. The room is read with getDoc(rooms/CODE): the code is the
// document id, so no collection query (and no room listing) is needed.
import { db, ensureAnonAuth } from "./firebase.js";
import "./account_store.js";
import { doc, getDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { teamName } from "./room_state.js";

const PROFILE_KEY = "atom_buzzer_profile";
const $ = (id) => document.getElementById(id);
const codeInput = $("joinCode");
const nameInput = $("displayName");
const teamSelect = $("teamSelect");
const codeHint = $("codeHint");
const joinError = $("joinError");
const joinButton = $("joinRoomBtn");
const form = $("joinForm");

let found = null;       // {code, data} for the room currently in the code box
let lookupTimer = null;
let preferredTeam = "";

function safeParse(raw) {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function clearTeams(message) {
  found = null;
  teamSelect.replaceChildren(new Option(message, ""));
  teamSelect.disabled = true;
}

function fillTeams(data) {
  const teams = Object.keys(data.scores || {}).sort();
  teamSelect.replaceChildren(...teams.map((team) => new Option(teamName(data, team), team)));
  teamSelect.disabled = false;
  if (preferredTeam && teams.includes(preferredTeam)) teamSelect.value = preferredTeam;
}

/** Look the room up by code. Resolves to the room, or null when no room has that code. */
async function lookup(code) {
  await ensureAnonAuth();
  const snap = await getDoc(doc(db, "rooms", code));
  if (codeInput.value.trim().toUpperCase() !== code) return null;
  if (!snap.exists()) {
    clearTeams("No room with this code");
    codeHint.textContent = "No room has this code. Check it with the host.";
    return null;
  }
  const data = snap.data();
  if (data.status === "ended") {
    clearTeams("Game over");
    codeHint.textContent = "This game has ended.";
    return null;
  }
  found = { code, data };
  fillTeams(data);
  codeHint.textContent = `Found "${data.roomName || `Room ${code}`}". Pick your team.`;
  return found;
}

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  joinError.textContent = "";
  clearTimeout(lookupTimer);
  const code = codeInput.value;
  if (code.length < 5) {
    clearTeams("Find the room first");
    codeHint.textContent = "Five letters or numbers.";
    return;
  }
  codeHint.textContent = "Looking for the room...";
  lookupTimer = setTimeout(() => {
    lookup(code).catch(() => {
      if (codeInput.value === code) {
        clearTeams("Find the room first");
        codeHint.textContent = "Could not look up the room. Check your connection and try again.";
      }
    });
  }, 300);
});

nameInput.addEventListener("input", () => {
  nameInput.value = nameInput.value.slice(0, 40);
});

async function join(event) {
  event.preventDefault();
  joinError.textContent = "";
  const code = codeInput.value.trim();
  if (!/^[A-Z0-9]{5}$/.test(code)) {
    joinError.textContent = "Enter the five-character room code.";
    codeInput.focus();
    return;
  }
  const name = nameInput.value.trim().slice(0, 40) || "Player";
  joinButton.disabled = true;
  try {
    if (!found || found.code !== code) await lookup(code);
    if (!found) {
      joinError.textContent = "Room not found. Check the code with your host.";
      return;
    }
    const team = teamSelect.value;
    if (!team) {
      joinError.textContent = "Choose your team.";
      return;
    }
    const user = await ensureAnonAuth();
    const roomRef = doc(db, "rooms", code);
    const memberRef = doc(db, "rooms", code, "players", user.uid);
    let isHost = false;
    let basic = false;
    await runTransaction(db, async (tx) => {
      const room = await tx.get(roomRef);
      if (!room.exists()) throw new Error("This room no longer exists.");
      const data = room.data();
      if (data.status === "ended") throw new Error("This game has ended.");
      if (!Object.prototype.hasOwnProperty.call(data.scores || {}, team)) throw new Error("That team is not in this room. Choose another team.");
      const existing = await tx.get(memberRef);
      if (existing.exists() && existing.data().team !== team && data.status !== "lobby") {
        throw new Error("Team changes are only allowed before the game starts.");
      }
      isHost = data.hostUid === user.uid;
      basic = data.settings?.mode === "basic";
      tx.set(memberRef, {
        name,
        team,
        joinedAt: existing.exists() ? existing.data().joinedAt : serverTimestamp(),
        isHost
      });
    });
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, team }));
    localStorage.setItem("atom_buzzer_role", isHost ? "host" : "player");
    if (window.atomAccount?.getUser?.()) window.atomAccount.saveBuzzerProfile({ name, team }).catch(() => {});
    window.location.href = `${isHost ? (basic ? "/buzzer-basic" : "/buzzer-room") : "/buzzer-room-player"}?roomId=${encodeURIComponent(code)}`;
  } catch (err) {
    joinError.textContent = `Could not join: ${err.message || "check your connection and try again."}`;
  } finally {
    joinButton.disabled = false;
  }
}

form.addEventListener("submit", join);

// Prefill from an earlier visit, then from the saved account profile when it loads.
const saved = safeParse(localStorage.getItem(PROFILE_KEY)) || {};
if (saved.name) nameInput.value = saved.name.slice(0, 40);
if (saved.team) preferredTeam = saved.team;

if (window.atomAccount?.onAuthChange) {
  window.atomAccount.onAuthChange(async (user) => {
    if (!user) return;
    try {
      const remote = await window.atomAccount.loadBuzzerProfile();
      if (remote?.name && !nameInput.value) nameInput.value = remote.name.slice(0, 40);
      if (remote?.team) preferredTeam = remote.team;
      if (found) fillTeams(found.data);
    } catch {}
  });
}

const invited = (new URLSearchParams(window.location.search).get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
if (invited) {
  codeInput.value = invited;
  codeInput.dispatchEvent(new Event("input"));
}
