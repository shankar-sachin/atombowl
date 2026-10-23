// @ts-nocheck
import { db, auth, ensureAnonAuth } from './firebase.js';
import { doc, getDoc, updateDoc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import { buzzPatch, hostPatch, materialize } from './room_state.js';
/**
 * One plain update built from the cached room and membership: no transaction, no reads.
 * Firestore rules accept only the first buzz (old.currentBuzz == null), so a slower
 * competitor is rejected with permission-denied.
 */
export async function sendBuzz(roomId, room, member, seenAt) {
    const user = auth.currentUser || await ensureAnonAuth();
    if (!room)
        throw new Error('The room is still loading.');
    if (!member)
        throw new Error('Join this room before buzzing.');
    const patch = buzzPatch(room, { uid: user.uid, name: member.name, team: member.team }, Date.now(), seenAt);
    await updateDoc(doc(db, 'rooms', roomId), patch);
    return patch;
}
/**
 * Host actions stay transactional (they must not clobber a buzz that lands at the same
 * moment). Resolves true when something was written, false for a no-op.
 */
export async function sendHostAction(roomId, action, options = {}, now = Date.now()) {
    const user = auth.currentUser;
    if (!user || !roomId)
        throw new Error('You are signed out. Reload the page to reconnect.');
    const ref = doc(db, 'rooms', roomId);
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists())
            throw new Error('This room no longer exists.');
        const patch = hostPatch(snap.data(), user.uid, action, options, now);
        if (!Object.keys(patch).length)
            return false;
        tx.update(ref, materialize(patch, serverTimestamp()));
        return true;
    });
}
export async function loadMembership(roomId, uid) {
    const snap = await getDoc(doc(db, 'rooms', roomId, 'players', uid));
    return snap.exists() ? snap.data() : null;
}
//# sourceMappingURL=room_store.js.map