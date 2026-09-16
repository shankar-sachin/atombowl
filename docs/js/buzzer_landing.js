var _a;
// @ts-nocheck
import { db, ensureAnonAuth } from "./firebase.js";
import "./account_store.js";
import { doc, collection, runTransaction, serverTimestamp, getDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
const joinCodeInput = document.getElementById("joinCode");
const displayNameInput = document.getElementById("displayName");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const joinError = document.getElementById("joinError");
const teamSelect = document.getElementById("teamSelect");
const teamHint = document.getElementById("teamHint");
const goCreateBtn = document.getElementById("goCreateBtn");
const state = { team: "A", roomId: null };
const BUZZER_PROFILE_KEY = "atom_buzzer_profile";
let preferredTeam = null;
function safeParse(raw) {
    try {
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
function setTeamOptions(teamCount, teamNames) {
    teamSelect.innerHTML = "";
    const count = Math.max(2, Math.min(4, teamCount || 2));
    for (let i = 0; i < count; i += 1) {
        const team = String.fromCharCode(65 + i);
        const opt = document.createElement("option");
        opt.value = team;
        opt.textContent = (teamNames === null || teamNames === void 0 ? void 0 : teamNames[team]) || `Team ${team}`;
        teamSelect.appendChild(opt);
    }
    if (preferredTeam && [...teamSelect.options].some((opt) => opt.value === preferredTeam)) {
        teamSelect.value = preferredTeam;
    }
    state.team = teamSelect.value;
}
setTeamOptions(2);
teamSelect.addEventListener("change", () => {
    state.team = teamSelect.value;
});
const localProfile = safeParse(localStorage.getItem(BUZZER_PROFILE_KEY)) || {};
if (displayNameInput && (localProfile === null || localProfile === void 0 ? void 0 : localProfile.name))
    displayNameInput.value = localProfile.name;
if (localProfile === null || localProfile === void 0 ? void 0 : localProfile.team) {
    preferredTeam = localProfile.team;
    setTeamOptions(2);
}
if ((_a = window.atomAccount) === null || _a === void 0 ? void 0 : _a.onAuthChange) {
    window.atomAccount.onAuthChange(async (user) => {
        var _a;
        if (!user)
            return;
        try {
            const remote = await window.atomAccount.loadBuzzerProfile();
            if ((remote === null || remote === void 0 ? void 0 : remote.name) && displayNameInput)
                displayNameInput.value = remote.name;
            if (remote === null || remote === void 0 ? void 0 : remote.team) {
                preferredTeam = remote.team;
                if ((_a = teamSelect === null || teamSelect === void 0 ? void 0 : teamSelect.options) === null || _a === void 0 ? void 0 : _a.length) {
                    const match = [...teamSelect.options].some((opt) => opt.value === preferredTeam);
                    if (match) {
                        teamSelect.value = preferredTeam;
                        state.team = teamSelect.value;
                    }
                }
            }
        }
        catch { }
    });
}
let lookupTimer = null;
joinCodeInput.addEventListener("input", () => {
    joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const code = joinCodeInput.value.trim();
    state.roomId = null;
    if (lookupTimer)
        clearTimeout(lookupTimer);
    if (code.length < 5) {
        teamHint.textContent = "Teams will load when a valid code is entered.";
        setTeamOptions(2);
        state.roomId = null;
        return;
    }
    lookupTimer = setTimeout(() => {
        lookupRoomTeams(code).catch(() => {
            if (joinCodeInput.value.trim() !== code)
                return;
            teamHint.textContent = "Room not found yet.";
            setTeamOptions(2);
            state.roomId = null;
        });
    }, 250);
});
goCreateBtn.addEventListener("click", () => {
    window.location.href = "buzzer_create.html";
});
async function joinRoom() {
    var _a, _b;
    joinError.textContent = "";
    const code = joinCodeInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) {
        joinError.textContent = "Enter a room code.";
        return;
    }
    const user = await ensureAnonAuth();
    const name = displayNameInput.value.trim().slice(0, 40) || "Player";
    const roomDoc = state.roomId
        ? await getDoc(doc(db, "rooms", state.roomId))
        : null;
    let room = (roomDoc === null || roomDoc === void 0 ? void 0 : roomDoc.exists()) && roomDoc.data().roomCode === code ? roomDoc : null;
    if (!room) {
        const q = query(collection(db, "rooms"), where("roomCode", "==", code));
        const snap = await getDocs(q);
        if (!snap.empty)
            room = snap.docs[0];
    }
    if (!room) {
        joinError.textContent = "Room not found.";
        return;
    }
    const team = teamSelect.value;
    let isHost = false;
    await runTransaction(db, async (tx) => {
        var _a;
        const fresh = await tx.get(room.ref);
        if (!fresh.exists() || fresh.data().status === "ended")
            throw new Error("Room is no longer available.");
        if (!Object.prototype.hasOwnProperty.call(fresh.data().scores || {}, team))
            throw new Error("Choose a valid team for this room.");
        const ref = doc(db, "rooms", room.id, "players", user.uid);
        const member = await tx.get(ref);
        isHost = fresh.data().hostUid === user.uid;
        if (member.exists() && member.data().team !== team && fresh.data().status !== "lobby") {
            throw new Error("Team changes are only allowed in the lobby.");
        }
        tx.set(ref, { name, team, joinedAt: ((_a = member.data()) === null || _a === void 0 ? void 0 : _a.joinedAt) || serverTimestamp(), isHost });
    });
    state.team = team;
    localStorage.setItem("atom_buzzer_profile", JSON.stringify({
        name,
        team: state.team
    }));
    localStorage.setItem("atom_buzzer_role", "player");
    if ((_b = (_a = window.atomAccount) === null || _a === void 0 ? void 0 : _a.getUser) === null || _b === void 0 ? void 0 : _b.call(_a)) {
        window.atomAccount.saveBuzzerProfile({
            name,
            team: state.team
        }).catch(() => { });
    }
    window.location.href = `${isHost ? "buzzer_room.html" : "buzzer_room_player.html"}?roomId=${encodeURIComponent(room.id)}`;
}
async function lookupRoomTeams(code) {
    var _a, _b;
    await ensureAnonAuth();
    const q = query(collection(db, "rooms"), where("roomCode", "==", code));
    const snap = await getDocs(q);
    if (snap.empty)
        throw new Error("not found");
    if (joinCodeInput.value.trim() !== code)
        return;
    const roomDoc = snap.docs[0];
    const data = roomDoc.data();
    const teamCount = ((_a = data === null || data === void 0 ? void 0 : data.settings) === null || _a === void 0 ? void 0 : _a.teamCount) || 2;
    const teamNames = ((_b = data === null || data === void 0 ? void 0 : data.settings) === null || _b === void 0 ? void 0 : _b.teamNames) || {};
    setTeamOptions(teamCount, teamNames);
    state.roomId = roomDoc.id;
    teamHint.textContent = `Room found: ${teamCount} teams.`;
}
joinRoomBtn.addEventListener("click", () => {
    if (joinRoomBtn.disabled)
        return;
    joinRoomBtn.disabled = true;
    joinRoom().catch((err) => {
        console.error(err);
        joinError.textContent = `Join failed: ${err.message || "Check Firebase permissions and connection."}`;
    }).finally(() => { joinRoomBtn.disabled = false; });
});
const invitedCode = new URLSearchParams(window.location.search).get("code");
if (invitedCode) {
    joinCodeInput.value = invitedCode;
    joinCodeInput.dispatchEvent(new Event("input"));
}
//# sourceMappingURL=buzzer_landing.js.map