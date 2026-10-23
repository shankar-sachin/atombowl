// @ts-nocheck
// Player buzzer for one room. The button locks the moment it is pressed ("Buzzing...") and the
// rules accept only the first buzz. Membership is watched so a removed player can rejoin.
import { sendBuzz, loadMembership } from "./room_store.js";
import {
  buzzReason, teamIds, teamName, teamClass, stateLine, formatSeconds, formatClock, timedPhase,
  clockRunning, phaseDeadline, gameClockOf, clockRemaining, timeMillis, sentenceCase, LOG_LIMIT
} from "./room_state.js";
import { db, ensureAnonAuth } from "./firebase.js";
import {
  doc, collection, onSnapshot, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const els = {
  roomName: $("roomName"), roomCode: $("roomCode"), me: $("me"), rejoin: $("rejoin"), rejoinBtn: $("rejoinBtn"),
  stage: $("stage"), stateLine: $("stateLine"), phaseTime: $("phaseTime"), phaseLabel: $("phaseLabel"),
  category: $("category"), buzz: $("buzzBtn"), buzzLabel: $("buzzLabel"), buzzStatus: $("buzzStatus"),
  buzzError: $("buzzError"), teams: $("teams"), gameClock: $("gameClock"), roster: $("roster"),
  logList: $("logList"), logCount: $("logCount")
};

const roomId = new URLSearchParams(window.location.search).get("roomId");
let uid = null;
let snap = null;          // latest room
let members = [];         // players subcollection
let member = null;        // my membership doc {name, team}
let memberKnown = false;  // membership loaded at least once
let buzzSent = false;     // my buzz was accepted by the server and is waiting for the snapshot
let renderedLogSeq = 0;
let lastBuzzKey = null;
let rafId = 0;
let firstSnapshot = true;
let lastIdentity = { name: "Player", team: "A" };
const anchors = new Map();
const painted = {};
let unsubRoom = null;
let unsubPlayers = null;
let unsubMember = null;

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function paint(name, key, fn) {
  if (painted[name] === key) return;
  painted[name] = key;
  fn();
}

function anchorFor(key, serverValue) {
  if (!key) return null;
  if (!anchors.has(key)) {
    const fromServer = firstSnapshot ? timeMillis(serverValue) : null;
    anchors.set(key, fromServer ?? Date.now());
  }
  return anchors.get(key);
}

function phaseDeadlineOf(room) {
  return phaseDeadline(room, anchorFor(room.timers?.phaseKey, room.timers?.phaseStartedAt));
}

function clockLeft(room, now) {
  const clock = gameClockOf(room);
  if (clock.status !== "running") return clockRemaining(room, 0);
  const elapsed = Math.max(0, now - (anchorFor(clock.runKey, clock.startedAt) ?? now));
  return clockRemaining(room, elapsed);
}

function myBuzzIdentity() {
  return { uid, name: member?.name || lastIdentity.name, team: member?.team || lastIdentity.team };
}

/** Why I cannot buzz (empty string when I can), using the same rules the server applies. */
function reasonNow(room, now = Date.now()) {
  if (!member) return "Joining the room.";
  return buzzReason(room, myBuzzIdentity(), now, anchorFor(room.timers?.phaseKey, room.timers?.phaseStartedAt));
}

function buzzView(room, now) {
  if (room.status === "ended") return { label: "Game over", cls: "", disabled: true, title: "The game has ended." };
  if (!member) return { label: memberKnown ? "Rejoin to buzz" : "Joining", cls: "", disabled: true, title: "" };
  if (buzzSent) return { label: "Buzzing...", cls: "", disabled: true, title: "" };
  const buzz = room.currentBuzz;
  if (buzz) {
    if (buzz.uid === uid) return { label: "You buzzed first", cls: "mine", disabled: true, title: "" };
    return { label: `${teamName(room, buzz.team)} (${buzz.name}) buzzed`, cls: "", disabled: true, title: "" };
  }
  const reason = reasonNow(room, now);
  if (!reason) return { label: "Buzz now", cls: "ready", disabled: false, title: "" };
  if (reason.includes("locked out")) return { label: "Locked out", cls: "out", disabled: true, title: reason };
  if (reason.includes("Time is up")) return { label: "Time is up", cls: "", disabled: true, title: reason };
  return { label: "Waiting", cls: "", disabled: true, title: reason };
}

function stateNoteOf(room) {
  switch (room.status) {
    case "tossup_reading": return "Listen. Buzzing now is an interrupt.";
    case "tossup_open": return "Buzz when you know the answer.";
    case "bonus_open": return room.bonusTeam === member?.team ? "Your team's bonus. Answer with the team." : "";
    default: return "";
  }
}

function renderStage(room, now) {
  paint("stage", JSON.stringify([stateLine(room), room.currentCategory, stateNoteOf(room)]), () => {
    els.buzzError.textContent = "";
    setText(els.stateLine, stateLine(room));
    setText(els.category, room.currentCategory ? `Category: ${sentenceCase(room.currentCategory)}` : "");
    setText(els.roomName, room.roomName || `Room ${room.roomCode}`);
    setText(els.roomCode, room.roomCode || "-----");
    document.title = `${room.roomName || "Buzzer room"} | Atom Bowl`;
    els.buzzStatus.textContent = stateNoteOf(room);
  });
  const view = buzzView(room, now);
  const key = JSON.stringify([view, member?.team, buzzSent, room.status]);
  paint("buzz", key, () => {
    setText(els.buzzLabel, view.label);
    els.buzz.disabled = view.disabled;
    els.buzz.className = `buzz-btn ${teamClass(member?.team || "A")}${view.cls ? ` ${view.cls}` : ""}`;
    els.buzz.title = view.title;
  });
  if (member) {
    els.me.textContent = `${member.name}, ${teamName(room, member.team)}`;
  }
}

function renderFlash(room) {
  const buzz = room.currentBuzz;
  const key = buzz ? `${buzz.uid}:${buzz.at}` : "";
  if (key && key !== lastBuzzKey && lastBuzzKey !== null) {
    els.stage.classList.remove("flash");
    void els.stage.offsetWidth;
    els.stage.className = `panel player-stage ${teamClass(buzz.team)}`;
    void els.stage.offsetWidth;
    els.stage.classList.add("flash");
  }
  lastBuzzKey = key || null;
  if (buzzSent && buzz) buzzSent = false;
}

function renderTeams(room) {
  paint("teams", JSON.stringify([room.scores, room.settings?.teamNames, room.currentBuzz?.team]), () => {
    els.teams.replaceChildren();
    for (const team of teamIds(room)) {
      const card = document.createElement("div");
      card.className = `team-card ${teamClass(team)}${room.currentBuzz?.team === team ? " is-buzzing" : ""}`;
      const name = document.createElement("span");
      name.className = "team-name";
      name.textContent = teamName(room, team);
      const score = document.createElement("strong");
      score.className = "numerals";
      score.textContent = String(room.scores?.[team] ?? 0);
      card.append(name, score);
      els.teams.appendChild(card);
    }
  });
}

function renderRoster(room) {
  paint("roster", JSON.stringify([members, room.settings?.teamNames, uid]), () => {
    els.roster.replaceChildren();
    for (const team of teamIds(room)) {
      const group = document.createElement("div");
      group.className = `roster-group ${teamClass(team)}`;
      const heading = document.createElement("h3");
      heading.textContent = teamName(room, team);
      const list = document.createElement("ul");
      list.className = "roster-list";
      const people = members.filter((person) => person.team === team).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
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
        if (person.id === uid) {
          const you = document.createElement("span");
          you.className = "muted";
          you.textContent = "You";
          item.appendChild(you);
        } else if (person.id === room.hostUid) {
          const host = document.createElement("span");
          host.className = "muted";
          host.textContent = "Host";
          item.appendChild(host);
        }
        list.appendChild(item);
      }
      group.append(heading, list);
      els.roster.appendChild(group);
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

function renderLog(room) {
  const entries = room.log || [];
  const lastSeq = entries.length ? entries[entries.length - 1].seq || 0 : 0;
  setText(els.logCount, entries.length ? `(${entries.length})` : "");
  if (lastSeq === renderedLogSeq) return;
  if (lastSeq < renderedLogSeq) {
    els.logList.replaceChildren(...entries.slice().reverse().map(logItem));
  } else {
    for (const entry of entries.filter((item) => (item.seq || 0) > renderedLogSeq)) els.logList.prepend(logItem(entry));
  }
  while (els.logList.children.length > LOG_LIMIT) els.logList.lastElementChild.remove();
  renderedLogSeq = lastSeq;
}

function renderTimers(room, now) {
  if (timedPhase(room)) {
    setText(els.phaseTime, formatSeconds(phaseDeadlineOf(room) - now));
    setText(els.phaseLabel, room.status === "bonus_open" ? "Bonus time" : "Answer time");
  } else {
    setText(els.phaseTime, "");
    setText(els.phaseLabel, room.status === "tossup_reading" ? "Reading, buzzers open" : "");
  }
  setText(els.gameClock, formatClock(clockLeft(room, now)));
}

function needsLoop(room) {
  return timedPhase(room) || clockRunning(room);
}

function ensureLoop() {
  if (!rafId) rafId = requestAnimationFrame(frame);
}

function frame() {
  rafId = 0;
  if (!snap) return;
  const now = Date.now();
  renderTimers(snap, now);
  renderStage(snap, now);
  if (needsLoop(snap)) ensureLoop();
}

function render() {
  if (!snap) return;
  const now = Date.now();
  renderFlash(snap);
  renderStage(snap, now);
  renderTimers(snap, now);
  renderTeams(snap);
  renderRoster(snap);
  renderLog(snap);
  if (needsLoop(snap)) ensureLoop();
}

async function buzz() {
  if (!snap || !member || buzzSent || els.buzz.disabled) return;
  const room = snap;
  const reason = reasonNow(room);
  if (reason) {
    els.buzzError.textContent = reason;
    return;
  }
  els.buzzError.textContent = "";
  buzzSent = true;
  render();
  const seenAt = anchorFor(room.timers?.phaseKey, room.timers?.phaseStartedAt);
  try {
    await sendBuzz(roomId, room, member, seenAt);
  } catch (err) {
    buzzSent = false;
    els.buzzError.textContent = err?.code === "permission-denied"
      ? "Someone buzzed first."
      : (err?.message || "Your buzz did not go through. Try again.");
    render();
  }
}

function handleSpace(event) {
  if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  const active = document.activeElement;
  if (active && (active.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(active.tagName))) return;
  if (event.code !== "Space") return;
  event.preventDefault();
  if (els.buzz.disabled) {
    els.buzzError.textContent = snap ? reasonNow(snap) || "" : "";
    return;
  }
  buzz();
}

function attach(room) {
  unsubRoom?.();
  unsubRoom = onSnapshot(doc(db, "rooms", room), (snapshot) => {
    if (!snapshot.exists()) {
      snap = null;
      els.stateLine.textContent = "Room not found.";
      els.buzz.disabled = true;
      return;
    }
    const data = snapshot.data();
    if (data.hostUid === uid) {
      window.location.replace(`buzzer_room.html?roomId=${encodeURIComponent(room)}`);
      return;
    }
    snap = data;
    render();
    firstSnapshot = false;
  }, (err) => {
    els.stateLine.textContent = "Room unavailable";
    els.buzzError.textContent = `Cannot read this room: ${err.message}`;
  });

  unsubPlayers?.();
  unsubPlayers = onSnapshot(collection(db, "rooms", room, "players"), (snapshot) => {
    members = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    if (snap) renderRoster(snap);
  });

  unsubMember?.();
  unsubMember = onSnapshot(doc(db, "rooms", room, "players", uid), (snapshot) => {
    if (snapshot.exists()) {
      member = snapshot.data();
      lastIdentity = { name: member.name, team: member.team };
      els.rejoin.hidden = true;
    } else {
      member = null;
      if (memberKnown) els.rejoin.hidden = false;
    }
    memberKnown = true;
    if (snap) render();
  });
}

els.rejoinBtn.addEventListener("click", async () => {
  els.rejoinBtn.disabled = true;
  els.buzzError.textContent = "";
  try {
    const room = snap;
    if (!room || !teamIds(room).includes(lastIdentity.team)) throw new Error("Your team is no longer in this room. Join again from the rooms page.");
    await setDoc(doc(db, "rooms", roomId, "players", uid), {
      name: lastIdentity.name, team: lastIdentity.team, joinedAt: serverTimestamp(), isHost: false
    });
  } catch (err) {
    els.buzzError.textContent = `Could not rejoin: ${err.message || "try again."}`;
  } finally {
    els.rejoinBtn.disabled = false;
  }
});

els.buzz.addEventListener("click", buzz);
document.addEventListener("keydown", handleSpace);

(async () => {
  if (!roomId) {
    els.stateLine.textContent = "Missing room. Open a room from the buzzer rooms page.";
    return;
  }
  const user = await ensureAnonAuth();
  uid = user.uid;
  const saved = await loadMembership(roomId, uid);
  if (!saved) {
    const room = await getDoc(doc(db, "rooms", roomId));
    if (!room.exists()) {
      els.stateLine.textContent = "Room not found.";
      return;
    }
    window.location.replace(`buzzer_rooms.html?code=${encodeURIComponent(room.data().roomCode)}`);
    return;
  }
  member = saved;
  lastIdentity = { name: saved.name, team: saved.team };
  attach(roomId);
})().catch((err) => {
  els.stateLine.textContent = err.message || "Unable to connect to the room.";
  els.buzz.disabled = true;
});

window.addEventListener("pagehide", () => {
  unsubRoom?.();
  unsubPlayers?.();
  unsubMember?.();
  if (rafId) cancelAnimationFrame(rafId);
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});
