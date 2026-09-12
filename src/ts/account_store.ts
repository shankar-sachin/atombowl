// @ts-nocheck
import { auth, db } from "./firebase.js";
// @ts-ignore
import {
  GoogleAuthProvider,
  OAuthProvider,
  EmailAuthProvider,
  signInWithPopup,
  signInWithCredential,
  linkWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  linkWithCredential,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  validatePassword
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
// @ts-ignore
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  increment,
  arrayUnion,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const SETTINGS_KEY = "atom_settings_v1";
const BUZZER_PROFILE_KEY = "atom_buzzer_profile";
const GUEST_TAG_KEY = "atom_guest_tag_v1";

let currentUser: any = null;
let syncError = "";
let signupInProgress = false;
let authGeneration = 0;
let currentProfile: any = null;
const listeners = new Set<(user: unknown | null) => void>();

function notify(user: unknown | null) {
  listeners.forEach((cb) => {
    try {
      cb(user);
    } catch {}
  });
}

function getUser() {
  return currentUser;
}

function getProfile() {
  return currentProfile || null;
}

function onAuthChange(cb: (user: unknown | null) => void) {
  listeners.add(cb);
  cb(currentUser);
  return () => listeners.delete(cb);
}

function safeJsonParse(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeUsername(username: string) {
  return String(username || "").trim().toLowerCase();
}

function sanitizeUsername(username: string) {
  const clean = normalizeUsername(username);
  return /^[a-z0-9]{3,20}$/.test(clean) ? clean : "";
}

function usersRef(uid: string) {
  return doc(db, "users", uid);
}

function usernameRef(username: string) {
  return doc(db, "usernames", sanitizeUsername(username));
}

function settingsRef(uid: string) {
  return doc(db, "users", uid, "settings", "current");
}

function buzzerProfileRef(uid: string) {
  return doc(db, "users", uid, "buzzerProfile", "current");
}

function statsRef(uid: string) {
  return doc(db, "users", uid, "stats", "lifetime");
}

function randomAlphaNum(size: number) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < size; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function getGuestTag() {
  let existing = "";
  try { existing = (localStorage.getItem(GUEST_TAG_KEY) || "").trim(); } catch {}
  if (existing && /^[A-Za-z0-9]{12}$/.test(existing)) return existing;
  const tag = randomAlphaNum(12);
  try {
    localStorage.setItem(GUEST_TAG_KEY, tag);
  } catch {}
  return tag;
}

async function loadUserProfile(uid: string) {
  if (!uid) return null;
  const snap = await getDoc(usersRef(uid));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  return data.profile || null;
}

async function ensureUserDoc(user: any) {
  if (!user?.uid) return;
  const providerIds = Array.isArray(user.providerData)
    ? user.providerData.map((p: any) => p?.providerId).filter(Boolean)
    : [];
  return runTransaction(db, async (tx: any) => {
    const ref = usersRef(user.uid);
    const snap = await tx.get(ref);
    const profile = {
      username: "", displayName: user.displayName || "",
      playerName: user.displayName || "", firstName: "", lastName: "",
      email: user.email || "", phone: "", photoURL: user.photoURL || "",
      ...(snap.data()?.profile || {}), providerIds
    };
    tx.set(ref, {
      profile,
      ...(!snap.exists() ? { createdAt: serverTimestamp() } : {}),
      lastLoginAt: serverTimestamp()
    }, { merge: true });
    return profile;
  });
}

async function isUsernameAvailable(username: string) {
  const clean = sanitizeUsername(username);
  if (!clean || clean.length < 3 || clean.length > 20) return false;
  const snap = await getDoc(usernameRef(clean));
  if (!snap.exists()) return true;
  if (!currentUser?.uid) return false;
  return snap.data()?.uid === currentUser.uid;
}

async function loadRemoteSettings() {
  if (!currentUser?.uid) return null;
  const ref = settingsRef(currentUser.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return data?.value || null;
}

async function syncSettings(user: any) {
  if (!user?.uid) return;
  const ref = settingsRef(user.uid);
  const snap = await getDoc(ref);
  if (auth.currentUser?.uid !== user.uid) return;
  const local = safeJsonParse(localStorage.getItem(SETTINGS_KEY));

  if (snap.exists() && snap.data()?.value) {
    const value = snap.data().value;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
    } catch {}
    (window as any).atomSettings = value;
    document.dispatchEvent(new CustomEvent("atomSettingsSynced", { detail: value }));
    return;
  }

  if (local) {
    await setDoc(ref, { value: local, updatedAt: serverTimestamp() }, { merge: true });
  }
}

async function saveSettings(settings: any) {
  if (!currentUser?.uid) return;
  const ref = settingsRef(currentUser.uid);
  await setDoc(ref, { value: settings, updatedAt: serverTimestamp() }, { merge: true });
}

async function loadBuzzerProfile() {
  if (!currentUser?.uid) return null;
  const ref = buzzerProfileRef(currentUser.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() || null;
}

async function syncBuzzerProfile(user: any) {
  if (!user?.uid) return;
  const ref = buzzerProfileRef(user.uid);
  const snap = await getDoc(ref);
  if (auth.currentUser?.uid !== user.uid) return;
  const local = safeJsonParse(localStorage.getItem(BUZZER_PROFILE_KEY));

  if (snap.exists()) {
    const value = snap.data() || {};
    try {
      localStorage.setItem(BUZZER_PROFILE_KEY, JSON.stringify({
        name: value?.name || "",
        team: value?.team || "A"
      }));
    } catch {}
    return;
  }

  if (local) {
    await setDoc(ref, {
      name: local?.name || "",
      team: local?.team || "A",
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
}

async function saveBuzzerProfile(profile: { name?: string; team?: string }) {
  if (!currentUser?.uid) return;
  const ref = buzzerProfileRef(currentUser.uid);
  await setDoc(ref, {
    name: profile?.name || "",
    team: profile?.team || "A",
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function loadPracticeStats() {
  if (!currentUser?.uid) return null;
  const snap = await getDoc(statsRef(currentUser.uid));
  if (!snap.exists()) return null;
  return snap.data() || null;
}

async function updatePracticeStats(patch: {
  totalRuns?: number;
  totalAnswered?: number;
  totalCorrect?: number;
  totalTime?: number;
  totalSlowCorrect?: number;
}) {
  if (!currentUser?.uid) return;
  const ref = statsRef(currentUser.uid);
  const next = {
    totalRuns: increment(Number(patch.totalRuns || 0)),
    totalAnswered: increment(Number(patch.totalAnswered || 0)),
    totalCorrect: increment(Number(patch.totalCorrect || 0)),
    totalTime: increment(Number(patch.totalTime || 0)),
    totalSlowCorrect: increment(Number(patch.totalSlowCorrect || 0)),
    lastRunAt: serverTimestamp()
  };
  await setDoc(ref, next, { merge: true });
}

function learnProgressRef(uid: string) {
  return doc(db, "users", uid, "learn", "progress");
}

async function loadLearnProgress(): Promise<string[] | null> {
  if (!currentUser?.uid) return null;
  const snap = await getDoc(learnProgressRef(currentUser.uid));
  if (!snap.exists()) return null;
  return Array.isArray(snap.data()?.completedLessons) ? snap.data().completedLessons : null;
}

async function saveLearnProgress(completedLessons: string[]) {
  if (!currentUser?.uid) return;
  await setDoc(learnProgressRef(currentUser.uid), {
    completedLessons: arrayUnion(...completedLessons), updatedAt: serverTimestamp()
  }, { merge: true });
}

function buildProvider(providerId: string) {
  if (providerId === "google") return new GoogleAuthProvider();
  return null;
}

async function signInWithProvider(providerId: string) {
  await auth.authStateReady();
  const provider = buildProvider(providerId);
  if (!provider) throw new Error("unknown-provider");

  if (auth.currentUser?.isAnonymous) {
    try {
      const res = await linkWithPopup(auth.currentUser, provider);
      return res.user;
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/credential-already-in-use") {
        const credential = providerId === "google"
          ? GoogleAuthProvider.credentialFromError(err) : OAuthProvider.credentialFromError(err);
        if (!credential) throw err;
        const res = await signInWithCredential(auth, credential);
        return res.user;
      }
      throw err;
    }
  }

  const res = await signInWithPopup(auth, provider);
  return res.user;
}

async function signInWithEmail(email: string, password: string) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Email is required.");
  const res = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  return res.user;
}

async function signInWithIdentifier(identifier: string, password: string) {
  if (!String(identifier).includes("@")) throw new Error("Please sign in with your email address.");
  return signInWithEmail(identifier, password);
}

async function resetPassword(email: string) {
  const value = String(email || "").trim();
  if (!value.includes("@")) throw new Error("Enter your email address first.");
  await sendPasswordResetEmail(auth, value);
}

async function signUpWithEmail(email: string, password: string, displayName = "") {
  const validation = await validatePassword(auth, password);
  if (!validation.isValid) {
    const missing = [];
    const policy = validation.passwordPolicy?.customStrengthOptions || {};
    if (validation.meetsMinPasswordLength === false) missing.push(`at least ${policy.minPasswordLength || 6} characters`);
    if (validation.meetsMaxPasswordLength === false) missing.push(`no more than ${policy.maxPasswordLength} characters`);
    if (validation.containsLowercaseLetter === false) missing.push("a lowercase letter");
    if (validation.containsUppercaseLetter === false) missing.push("an uppercase letter");
    if (validation.containsNumericCharacter === false) missing.push("a number");
    if (validation.containsNonAlphanumericCharacter === false) missing.push("a symbol");
    throw new Error(missing.length ? `Password needs ${missing.join(", ")}.` : "Please choose a stronger password.");
  }
  const normalizedEmail = String(email || "").trim().toLowerCase();
  await auth.authStateReady();
  if (auth.currentUser?.isAnonymous) {
    const cred = EmailAuthProvider.credential(normalizedEmail, password);
    const res = await linkWithCredential(auth.currentUser, cred);
    if (displayName) {
      await updateProfile(res.user, { displayName });
    }
    return res.user;
  }

  const res = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  if (displayName) {
    await updateProfile(res.user, { displayName });
  }
  return res.user;
}

async function signUpWithDetails(details: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  username: string;
  password: string;
  playerName?: string;
}) {
  const firstName = String(details?.firstName || "").trim();
  const lastName = String(details?.lastName || "").trim();
  const email = String(details?.email || "").trim().toLowerCase();
  const phone = String(details?.phone || "").trim();
  const username = sanitizeUsername(details?.username || "");
  const password = String(details?.password || "");
  const playerName = String(details?.playerName || `${firstName} ${lastName}` || "").trim();

  if (!firstName || !lastName || !email || !username || !password) {
    throw new Error("Please complete all required fields.");
  }

  if (password.length < 6) throw new Error("Password must be at least 6 characters.");
  if (!(await isUsernameAvailable(username))) throw new Error("That username is already taken.");
  signupInProgress = true;
  try {
    const user = await signUpWithEmail(email, password, playerName || username);

    const profile = {
      username,
      displayName: playerName || username,
      playerName: playerName || username,
      firstName,
      lastName,
      email,
      phone,
      photoURL: user?.photoURL || ""
    };
    await runTransaction(db, async (tx: any) => {
      const nameRef = usernameRef(username);
      const name = await tx.get(nameRef);
      const userRef = usersRef(user.uid);
      const existing = await tx.get(userRef);
      if (name.exists() && name.data()?.uid !== user.uid) {
        throw new Error("Account created, but that username was just taken. Sign in with your email; your account is still usable.");
      }
      // Public username records contain no email or other private profile data.
      tx.set(nameRef, { uid: user.uid, username });
      tx.set(userRef, {
        profile,
        ...(!existing.exists() ? { createdAt: serverTimestamp() } : {}),
        lastLoginAt: serverTimestamp()
      }, { merge: true });
    });
    return user;
  } catch (err) {
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      throw new Error(`Your account exists. Sign in with your email to continue. Profile setup failed: ${err.message || err}`);
    }
    throw err;
  } finally {
    signupInProgress = false;
    await refreshAccount(auth.currentUser);
  }
}

async function updateAccountProfile(patch: {
  username?: string;
  playerName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  photoURL?: string;
}) {
  if (!currentUser?.uid) throw new Error("Not signed in.");
  if (patch?.photoURL && patch.photoURL.length > 400000) throw new Error("Profile image is too large. Choose an image under 250 KB.");
  const user = currentUser;
  const prev = currentProfile || (await loadUserProfile(user.uid)) || {};
  const next = {
    ...prev,
    playerName: patch?.playerName != null ? String(patch.playerName).trim() : (prev.playerName || ""),
    displayName: patch?.playerName != null ? String(patch.playerName).trim() : (prev.displayName || ""),
    firstName: patch?.firstName != null ? String(patch.firstName).trim() : (prev.firstName || ""),
    lastName: patch?.lastName != null ? String(patch.lastName).trim() : (prev.lastName || ""),
    phone: patch?.phone != null ? String(patch.phone).trim() : (prev.phone || ""),
    photoURL: patch?.photoURL != null ? String(patch.photoURL).trim() : (prev.photoURL || "")
  };
  const username = patch.username ? sanitizeUsername(patch.username) : prev.username;
  if (patch.username && !username) throw new Error("Username must be 3-20 letters/numbers.");
  if (prev.username && username !== prev.username) throw new Error("Your username cannot be changed.");
  await runTransaction(db, async tx => {
    const ref = usersRef(user.uid);
    const existing = await tx.get(ref);
    if (existing.data()?.profile?.username && existing.data().profile.username !== username) {
      throw new Error("Your profile changed. Reload before saving.");
    }
    if (username && !prev.username) {
      const nameRef = usernameRef(username);
      const name = await tx.get(nameRef);
      if (name.exists() && name.data()?.uid !== user.uid) throw new Error("That username is already taken.");
      tx.set(nameRef, { uid: user.uid, username });
      next.username = username;
    }
    tx.set(ref, { profile: next, updatedAt: serverTimestamp() }, { merge: true });
  });
  if (currentUser?.uid === user.uid) currentProfile = next;
  try {
    await updateProfile(user, {
      displayName: next.playerName || next.displayName || "",
      ...(!next.photoURL?.startsWith("data:") ? { photoURL: next.photoURL || "" } : {})
    });
  } catch {}
  return next;
}

async function signOut() {
  await fbSignOut(auth);
}

async function refreshAccount(user: any) {
  const generation = ++authGeneration;
  const owner = user && !user.isAnonymous ? user.uid : "guest";
  try {
    const previous = localStorage.getItem("atom_cache_owner");
    if (previous && previous !== owner && previous !== "guest") {
      for (const key of [SETTINGS_KEY, BUZZER_PROFILE_KEY, "atom_learn_progress_v1"]) localStorage.removeItem(key);
      document.dispatchEvent(new CustomEvent("atomSettingsSynced", { detail: {} }));
    }
    localStorage.setItem("atom_cache_owner", owner);
  } catch {}
  currentUser = user && !user.isAnonymous ? user : null;
  currentProfile = null;
  syncError = "";
  if (!currentUser) { notify(null); return; }
  try {
    const profile = await ensureUserDoc(user);
    if (generation !== authGeneration || auth.currentUser?.uid !== user.uid) return;
    currentProfile = profile;
    await syncSettings(user);
    if (generation !== authGeneration) return;
    await syncBuzzerProfile(user);
  } catch (err) {
    if (generation !== authGeneration) return;
    syncError = "Signed in, but cloud sync failed. Check your connection and Firebase permissions.";
    console.warn("Account sync failed", err);
  }
  if (generation === authGeneration) notify(currentUser);
}

onAuthStateChanged(auth, (user: any) => {
  if (!signupInProgress) void refreshAccount(user);
});

window.atomAccount = {
  getUser,
  getProfile,
  getGuestTag,
  onAuthChange,
  signInWithProvider,
  signInWithEmail,
  signInWithIdentifier,
  signUpWithEmail,
  signUpWithDetails,
  signOut,
  loadRemoteSettings,
  saveSettings,
  updatePracticeStats,
  loadPracticeStats,
  isUsernameAvailable,
  resetPassword,
  getSyncError: () => syncError,
  updateAccountProfile,
  loadBuzzerProfile,
  saveBuzzerProfile,
  loadLearnProgress,
  saveLearnProgress
};
