// @ts-nocheck
// Host-side question reader for rooms created with "We provide the questions". It picks a Scalazar
// (Set B) question when a toss-up or bonus starts, reads it aloud on this device, and when the
// reading finishes moves the room on (done reading / start the bonus timer). The host still
// presses Next tossup. Nothing is written to the room: the question lives only on the host's page.
import { questionPool, pickIndex, speechText, normalizeLevel, cleanText } from "./room_questions.js";
import { sentenceCase } from "./room_state.js";
const BANK_URL = "data/set_B.json";
const VOICE_KEY = "atom_room_voice_v1";
export function createReader({ roomId, getRoom, act }) {
    const el = (id) => document.getElementById(id);
    const ui = {
        card: el("questionCard"), meta: el("questionMeta"), text: el("questionText"), answer: el("questionAnswer"),
        answerText: el("questionAnswerText"), note: el("questionNote"), replay: el("replayBtn"), swap: el("swapBtn"),
        voice: el("voiceBtn")
    };
    const storeKey = `atom_room_q_${roomId}`;
    const used = { tossup: new Set(), bonus: new Set() };
    let bank = null;
    let loading = false;
    let current = null; // { kind, n, qIdx }
    let lastStatus = "";
    let token = 0; // bumps whenever speech is cancelled or restarted
    let voiceOn = readVoice();
    let chunkIdx = 0; // sentence being spoken, so a graded interrupt resumes there
    let resumeAt = 0;
    function readVoice() {
        try {
            return localStorage.getItem(VOICE_KEY) !== "off";
        }
        catch {
            return true;
        }
    }
    function setNote(message) {
        if (ui.note.textContent !== message)
            ui.note.textContent = message;
    }
    function loadBank() {
        if (bank || loading)
            return;
        loading = true;
        setNote("Loading questions…");
        fetch(BANK_URL)
            .then((res) => { if (!res.ok)
            throw new Error(String(res.status)); return res.json(); })
            .then((data) => { bank = Array.isArray(data) ? data : []; setNote(""); sync(getRoom()); })
            .catch(() => setNote("Could not load the question bank. Read your own questions, or reload this page."))
            .finally(() => { loading = false; });
    }
    function stopSpeech() {
        var _a;
        token += 1;
        try {
            (_a = window.speechSynthesis) === null || _a === void 0 ? void 0 : _a.cancel();
        }
        catch { }
    }
    /** The question this page picked earlier for the current number, so a reload keeps it. */
    function restore(room, kind) {
        try {
            const saved = JSON.parse(sessionStorage.getItem(storeKey) || "null");
            if (saved && (!kind || saved.kind === kind) && saved.n === room.currentIndex && bank[saved.qIdx])
                return saved;
        }
        catch { }
        return null;
    }
    function choose(room, kind) {
        var _a;
        const pool = questionPool(bank, { level: normalizeLevel((_a = room.settings) === null || _a === void 0 ? void 0 : _a.questionLevel), bonus: kind === "bonus", category: room.currentCategory });
        const qIdx = pickIndex(pool, used[kind]);
        current = null;
        if (qIdx == null)
            return null;
        current = { kind, n: room.currentIndex, qIdx };
        try {
            sessionStorage.setItem(storeKey, JSON.stringify(current));
        }
        catch { }
        return current;
    }
    function paint(room) {
        ui.meta.hidden = !current || !(bank === null || bank === void 0 ? void 0 : bank[current.qIdx]);
        if (!current || !(bank === null || bank === void 0 ? void 0 : bank[current.qIdx])) {
            ui.meta.textContent = "";
            ui.answer.hidden = true;
            if (!loading)
                ui.text.textContent = room.status === "ended" ? "The game is over." : "The next toss-up is chosen when you start it.";
            return;
        }
        const q = bank[current.qIdx];
        ui.meta.textContent = `${current.kind === "bonus" ? "Bonus" : "Toss-up"} ${current.n} · ${sentenceCase(q.category)} · ${q.type === "MC" ? "Multiple choice" : "Short answer"}`;
        ui.text.textContent = cleanText(q.question_text);
        ui.answerText.textContent = cleanText(q.parsed_answer);
        ui.answer.hidden = false;
    }
    /** Read the current question; `then` runs once it has been read to the end. */
    function speak(then, from = 0) {
        stopSpeech();
        const synth = window.speechSynthesis;
        if (!current || !(bank === null || bank === void 0 ? void 0 : bank[current.qIdx]))
            return;
        if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
            setNote("This browser can't read aloud. Read the question yourself.");
            return;
        }
        if (!voiceOn) {
            setNote("Read aloud is off. Read the question yourself.");
            return;
        }
        const mine = token;
        const settings = window.atomSettings || {};
        const voices = synth.getVoices();
        const voice = settings.ttsVoice ? voices.find((v) => (v.voiceURI || v.name) === settings.ttsVoice) : null;
        const preferred = voice || voices.find((v) => /en-US/i.test(v.lang) && /Google|Microsoft|Samantha/i.test(v.name));
        // Chrome stalls on long utterances, so each sentence is its own utterance.
        const all = speechText(bank[current.qIdx], current.kind).match(/[^.?!]+[.?!]+(\s|$)|[^.?!]+$/g) || [];
        const chunks = all.slice(Math.min(from, Math.max(0, all.length - 1)));
        const offset = all.length - chunks.length;
        setNote("");
        chunks.forEach((chunk, i) => {
            var _a, _b, _c;
            const utterance = new SpeechSynthesisUtterance(chunk.trim());
            utterance.rate = Math.max(0.6, Math.min(2, Number((_a = settings.ttsRate) !== null && _a !== void 0 ? _a : 1)));
            utterance.pitch = Number((_b = settings.ttsPitch) !== null && _b !== void 0 ? _b : 1);
            utterance.volume = Number((_c = settings.ttsVolume) !== null && _c !== void 0 ? _c : 1);
            if (preferred)
                utterance.voice = preferred;
            utterance.onstart = () => { if (mine === token)
                chunkIdx = offset + i; };
            utterance.onerror = (event) => {
                if (mine !== token || event.error === "canceled" || event.error === "interrupted")
                    return;
                setNote("The browser blocked audio. Press Read again, then use Done reading if it stays silent.");
            };
            if (i === chunks.length - 1)
                utterance.onend = () => { if (mine === token)
                    then === null || then === void 0 ? void 0 : then(); };
            synth.speak(utterance);
        });
    }
    function afterReading(kind, n) {
        return () => {
            var _a;
            const room = getRoom();
            if (!room || room.currentIndex !== n)
                return;
            if (room.currentBuzz)
                return; // someone buzzed while the last words were spoken; grade first
            if (kind === "tossup" && room.status === "tossup_reading" && ((_a = room.settings) === null || _a === void 0 ? void 0 : _a.autoStartTimer) !== false)
                act("done_reading");
            if (kind === "bonus" && room.status === "bonus_ready")
                act("bonus_start", { team: room.bonusTeam });
        };
    }
    function startReading(from = 0) {
        speak(afterReading(current.kind, current.n), from);
    }
    function sync(room) {
        var _a;
        if (!((_a = room === null || room === void 0 ? void 0 : room.settings) === null || _a === void 0 ? void 0 : _a.provideQuestions)) {
            ui.card.hidden = true;
            return;
        }
        ui.card.hidden = false;
        if (!bank) {
            loadBank();
            paint(room);
            return;
        }
        const status = room.status;
        const kind = status === "tossup_reading" ? "tossup" : status === "bonus_ready" ? "bonus" : "";
        if (kind) {
            const isNew = !current || current.kind !== kind || current.n !== room.currentIndex;
            if (isNew) {
                resumeAt = 0;
                chunkIdx = 0;
                const kept = restore(room, kind);
                if (kept)
                    current = kept;
                else if (!choose(room, kind))
                    setNote("No questions match this division and category. Read your own.");
                paint(room);
                // A reload mid-read doesn't restart speech until the host asks, so audio isn't blocked.
                if (current && !kept)
                    startReading();
            }
            else if (lastStatus !== status && current) {
                paint(room);
                // An interrupt was graded wrong: the other teams hear the question again from the interrupted sentence.
                startReading(lastStatus === "tossup_locked" ? resumeAt : 0);
            }
        }
        else {
            if (!current)
                current = restore(room, "");
            if (lastStatus !== status && status === "tossup_locked" && lastStatus === "tossup_reading")
                resumeAt = chunkIdx;
            if (lastStatus !== status && ["tossup_open", "tossup_locked", "bonus_open", "bonus_locked", "ended", "tossup_dead", "between"].includes(status))
                stopSpeech();
            paint(room);
        }
        lastStatus = status;
    }
    ui.replay.addEventListener("click", () => {
        const room = getRoom();
        if (!current || !room)
            return setNote("There is no question to read yet.");
        speak(room.status === "tossup_reading" || room.status === "bonus_ready" ? afterReading(current.kind, current.n) : null);
    });
    ui.swap.addEventListener("click", () => {
        const room = getRoom();
        if (!room || !["tossup_reading", "bonus_ready"].includes(room.status))
            return setNote("Pick a different question while one is being read.");
        if (choose(room, room.status === "bonus_ready" ? "bonus" : "tossup")) {
            resumeAt = 0;
            chunkIdx = 0;
            paint(room);
            startReading();
        }
    });
    ui.voice.addEventListener("click", () => {
        voiceOn = !voiceOn;
        try {
            localStorage.setItem(VOICE_KEY, voiceOn ? "on" : "off");
        }
        catch { }
        ui.voice.setAttribute("aria-pressed", String(voiceOn));
        ui.voice.textContent = `Read aloud: ${voiceOn ? "on" : "off"}`;
        if (!voiceOn) {
            stopSpeech();
            setNote("Read aloud is off. Read the question yourself.");
        }
        else
            setNote("");
    });
    ui.voice.setAttribute("aria-pressed", String(voiceOn));
    ui.voice.textContent = `Read aloud: ${voiceOn ? "on" : "off"}`;
    window.addEventListener("pagehide", stopSpeech);
    return { sync, stop: stopSpeech };
}
//# sourceMappingURL=room_reader.js.map