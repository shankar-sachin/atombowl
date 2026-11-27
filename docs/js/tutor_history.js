// Pure helpers for Tutor's saved chats, shared by the widget and the tests.
// Chats are kept in localStorage and mirrored to users/{uid}/tutorChats/{id} in Firestore.
export const MAX_CHATS = 40;
export const MAX_MESSAGES = 30;
// Quiz progress on a message: answers as strings, results as booleans, nothing else.
function cleanQuizState(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const a = {};
    const ok = {};
    for (const [k, v] of Object.entries(raw.a || {}))
        if (typeof v === "string" && /^\d+\.\d+$/.test(k))
            a[k] = v.slice(0, 300);
    for (const [k, v] of Object.entries(raw.ok || {}))
        if (typeof v === "boolean" && /^\d+\.\d+$/.test(k))
            ok[k] = v;
    return Object.keys(a).length || Object.keys(ok).length ? { a, ok } : null;
}
// Accepts a stored or remote chat and returns a clean copy, or null when it is unusable.
export function cleanChat(raw) {
    if (!raw || typeof raw.id !== "string" || !raw.id || !Array.isArray(raw.messages))
        return null;
    const messages = raw.messages
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text)
        .map((m) => {
        const quiz = cleanQuizState(m.quiz);
        return quiz ? { role: m.role, text: m.text, quiz } : { role: m.role, text: m.text };
    })
        .slice(-MAX_MESSAGES);
    if (!messages.length)
        return null;
    const context = raw.context && typeof raw.context === "object" ? JSON.parse(JSON.stringify(raw.context)) : null;
    return {
        id: raw.id,
        title: typeof raw.title === "string" && raw.title ? raw.title.slice(0, 80) : "New chat",
        updated: Number.isFinite(raw.updated) ? raw.updated : 0,
        messages,
        context
    };
}
// Merges the Firestore copy into the local list. `synced` is the set of ids last known to exist
// in Firestore, which tells "never uploaded yet" apart from "deleted elsewhere".
// True when `a` is `b` plus more messages: the same conversation, carried further.
function continues(a, b) {
    return a.messages.length > b.messages.length
        && b.messages.every((m, i) => { var _a, _b; return ((_a = a.messages[i]) === null || _a === void 0 ? void 0 : _a.role) === m.role && ((_b = a.messages[i]) === null || _b === void 0 ? void 0 : _b.text) === m.text; });
}
export function mergeRemote(local, remote, synced) {
    const remoteById = new Map(remote.map((c) => [c.id, c]));
    const knew = new Set(synced);
    const merged = new Map(remote.map((c) => [c.id, c]));
    const upload = [];
    for (const mine of local) {
        const theirs = remoteById.get(mine.id);
        if (theirs) {
            // Device clocks can disagree, so a copy that continues the other one wins whatever they say.
            const mineWins = continues(mine, theirs) || (!continues(theirs, mine) && mine.updated > theirs.updated);
            if (mineWins) {
                merged.set(mine.id, mine);
                upload.push(mine);
            }
        }
        else if (!knew.has(mine.id)) {
            merged.set(mine.id, mine);
            upload.push(mine);
        }
        // else: it was synced before and is gone from Firestore, so it was deleted elsewhere.
    }
    const sorted = [...merged.values()].sort((a, b) => b.updated - a.updated);
    const history = sorted.slice(0, MAX_CHATS);
    const kept = new Set(history.map((c) => c.id));
    return {
        history,
        synced: history.filter((c) => remoteById.has(c.id)).map((c) => c.id),
        upload: upload.filter((c) => kept.has(c.id)),
        prune: sorted.slice(MAX_CHATS).filter((c) => remoteById.has(c.id)).map((c) => c.id)
    };
}
//# sourceMappingURL=tutor_history.js.map