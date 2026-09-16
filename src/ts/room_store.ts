// @ts-nocheck
import { db, auth, ensureAnonAuth } from './firebase.js';
import { doc, getDoc, runTransaction } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import { buzzPatch, hostPatch } from './room_state.js';

export async function sendBuzz(roomId: string) {
  const user = await ensureAnonAuth();
  const ref = doc(db, 'rooms', roomId);
  return runTransaction(db, async tx => {
    const room = await tx.get(ref);
    const member = await tx.get(doc(db, 'rooms', roomId, 'players', user.uid));
    if (!room.exists()) throw new Error('Room not found.');
    if (!member.exists()) throw new Error('Join this room before buzzing.');
    tx.update(ref, buzzPatch(room.data(), { ...member.data(), uid: user.uid }));
  });
}

export async function sendHostAction(roomId: string, action: string, options = {}) {
  const user = auth.currentUser;
  if (!user || !roomId) throw new Error('Sign in and join a room first.');
  const ref = doc(db, 'rooms', roomId);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found.');
    const patch = hostPatch(snap.data(), user.uid, action, options);
    if (Object.keys(patch).length) tx.update(ref, patch);
  });
}

export async function loadMembership(roomId: string, uid: string) {
  const snap = await getDoc(doc(db, 'rooms', roomId, 'players', uid));
  return snap.exists() ? snap.data() : null;
}
