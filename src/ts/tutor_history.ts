// Pure helpers for Tutor's saved chats, shared by the widget and the tests.
// Chats are kept in localStorage and mirrored to users/{uid}/tutorChats/{id} in Firestore.

export type ChatMessage = { role: "user" | "assistant"; text: string };
export type Chat = { id: string; title: string; updated: number; messages: ChatMessage[]; context: Record<string, unknown> | null };

export const MAX_CHATS = 40;
export const MAX_MESSAGES = 30;

// Accepts a stored or remote chat and returns a clean copy, or null when it is unusable.
export function cleanChat(raw: any): Chat | null {
  if (!raw || typeof raw.id !== "string" || !raw.id || !Array.isArray(raw.messages)) return null;
  const messages: ChatMessage[] = raw.messages
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text)
    .map((m: any) => ({ role: m.role, text: m.text }))
    .slice(-MAX_MESSAGES);
  if (!messages.length) return null;
  const context = raw.context && typeof raw.context === "object" ? JSON.parse(JSON.stringify(raw.context)) : null;
  return {
    id: raw.id,
    title: typeof raw.title === "string" && raw.title ? raw.title.slice(0, 80) : "New chat",
    updated: Number.isFinite(raw.updated) ? raw.updated : 0,
    messages,
    context
  };
}

export type MergeResult = {
  history: Chat[];
  // Ids that exist in Firestore after this merge. A local chat in this list that later vanishes
  // from Firestore was deleted on another device.
  synced: string[];
  // Local chats that Firestore does not have (or has an older copy of): write them.
  upload: Chat[];
  // Firestore chats that no longer fit in the newest MAX_CHATS: delete them.
  prune: string[];
};

// Merges the Firestore copy into the local list. `synced` is the set of ids last known to exist
// in Firestore, which tells "never uploaded yet" apart from "deleted elsewhere".
export function mergeRemote(local: Chat[], remote: Chat[], synced: string[]): MergeResult {
  const remoteById = new Map(remote.map((c) => [c.id, c]));
  const knew = new Set(synced);
  const merged = new Map<string, Chat>(remote.map((c) => [c.id, c]));
  const upload: Chat[] = [];
  for (const mine of local) {
    const theirs = remoteById.get(mine.id);
    if (theirs) {
      if (mine.updated > theirs.updated) {
        merged.set(mine.id, mine);
        upload.push(mine);
      }
    } else if (!knew.has(mine.id)) {
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
