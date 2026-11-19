// @ts-nocheck
// Tutor chats in Firestore: users/{uid}/tutorChats/{chatId}. The existing rules already let a
// signed-in user read and write anything under their own users/{uid}. Loaded on demand by the widget.
import { db } from "./firebase.js";
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { MAX_CHATS } from "./tutor_history.js";
const chats = (uid) => collection(db, "users", uid, "tutorChats");
// Calls onDocs with every saved chat (newest first) now and whenever one changes on any device.
export function subscribe(uid, onDocs, onError) {
    return onSnapshot(query(chats(uid), orderBy("updated", "desc"), limit(MAX_CHATS + 10)), (snap) => onDocs(snap.docs.map((d) => ({ ...d.data(), id: d.id }))), onError);
}
export function pushChat(uid, chat) {
    const { id, title, updated, messages, context } = chat;
    // JSON round trip drops undefined values, which Firestore rejects.
    return setDoc(doc(chats(uid), id), JSON.parse(JSON.stringify({ title, updated, messages, context: context || null })));
}
export function removeChat(uid, id) {
    return deleteDoc(doc(chats(uid), id));
}
//# sourceMappingURL=tutor_sync.js.map