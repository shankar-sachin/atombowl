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
  onIdTokenChanged,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
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
const WRITE_ERROR_KEY = "atom_sync_error_v1";
// Last signed-in name and photo, so pages can show them before Firebase loads (common.ts reads it).
const ACCOUNT_HINT_KEY = "atom_account_hint_v1";

let currentUser: any = null;
let syncError = "";
let signupInProgress = false;
let authGeneration = 0;
let currentProfile: any = null;
let lastAuthKey: string | null = null;
let ready = false;
let resolveReady: () => void = () => {};
const readyPromise = new Promise<void>((resolve) => { resolveReady = resolve; });
const listeners = new Set<(user: unknown | null) => void>();

// Resolves once the first auth state has been read and the account (if any) loaded.
// Callers that load this module lazily should await it before calling getUser().
function whenReady() {
  return readyPromise;
}

function isReady() {
  return ready;
}

function errorLabel(err: any) {
  const code = String(err?.code || "").replace(/^(auth|firestore)\//, "");
  return code || String(err?.message || err || "unknown error");
}

// Writes from other pages (practice stats, settings, buzzer name, lessons) often run
// in fire-and-forget code. Record failures so the account page can show them.
function recordWriteError(what: string, err: any) {
  console.warn(`Atom Bowl: saving ${what} failed`, err);
  try {
    localStorage.setItem(WRITE_ERROR_KEY, JSON.stringify({
      what, code: errorLabel(err), at: Date.now(), uid: currentUser?.uid || ""
    }));
  } catch {}
}

function clearWriteError(what: string) {
  try {
    const prev = safeJsonParse(localStorage.getItem(WRITE_ERROR_KEY));
    if (prev && prev.what === what) localStorage.removeItem(WRITE_ERROR_KEY);
  } catch {}
}

function getLastWriteError() {
  try {
    const prev = safeJsonParse(localStorage.getItem(WRITE_ERROR_KEY));
    if (!prev || !prev.what) return null;
    if (currentUser?.uid && prev.uid && prev.uid !== currentUser.uid) return null;
    return prev;
  } catch {
    return null;
  }
}

function clearLastWriteError() {
  try { localStorage.removeItem(WRITE_ERROR_KEY); } catch {}
}

async function trackedWrite(what: string, write: () => Promise<void>) {
  try {
    await write();
    clearWriteError(what);
  } catch (err) {
    recordWriteError(what, err);
    throw err;
  }
}

function saveHint(user: any) {
  try {
    if (!user) {
      localStorage.removeItem(ACCOUNT_HINT_KEY);
      return;
    }
    const profile = currentProfile || {};
    localStorage.setItem(ACCOUNT_HINT_KEY, JSON.stringify({
      uid: user.uid,
      name: String(profile.playerName || profile.username || user.displayName || String(user.email || "").split("@")[0] || ""),
      username: String(profile.username || ""),
      email: String(profile.email || user.email || ""),
      photo: String(profile.photoURL || user.photoURL || "")
    }));
  } catch {}
}

function notify(user: unknown | null) {
  if (ready) saveHint(user);
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

// The name shown in buzzer rooms, kept in this browser for guests and signed-in players alike.
function getLocalName() {
  const saved = safeJsonParse(localStorage.getItem(BUZZER_PROFILE_KEY));
  return String(saved?.name || "").trim().slice(0, 40);
}

function setLocalName(name: string) {
  const clean = String(name || "").trim().slice(0, 40);
  try {
    const saved = safeJsonParse(localStorage.getItem(BUZZER_PROFILE_KEY)) || {};
    localStorage.setItem(BUZZER_PROFILE_KEY, JSON.stringify({ ...saved, name: clean, team: saved?.team || "A" }));
  } catch {}
  return clean;
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
  await whenReady();
  if (!currentUser?.uid) return;
  const ref = settingsRef(currentUser.uid);
  await trackedWrite("settings", () => setDoc(ref, { value: settings, updatedAt: serverTimestamp() }, { merge: true }));
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
  await whenReady();
  if (!currentUser?.uid) return;
  const ref = buzzerProfileRef(currentUser.uid);
  await trackedWrite("buzzer name", () => setDoc(ref, {
    name: profile?.name || "",
    team: profile?.team || "A",
    updatedAt: serverTimestamp()
  }, { merge: true }));
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
  await whenReady();
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
  await trackedWrite("practice stats", () => setDoc(ref, next, { merge: true }));
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
  await whenReady();
  if (!currentUser?.uid) return;
  const ref = learnProgressRef(currentUser.uid);
  await trackedWrite("lesson progress", () => setDoc(ref, {
    completedLessons: arrayUnion(...completedLessons), updatedAt: serverTimestamp()
  }, { merge: true }));
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
      // Linking keeps the uid, so onAuthStateChanged-style listeners never fire.
      await refreshAccount(res.user);
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

// Email/password accounts must confirm their address before Tutor and Generate work (the `ai`
// server checks the token's email_verified), so new accounts can't be made just for credits.
function needsEmailVerification(user = currentUser) {
  if (!user || user.isAnonymous || user.emailVerified) return false;
  const providers = (user.providerData || []).map((p: any) => p?.providerId);
  return providers.includes("password");
}

async function sendVerification(user = auth.currentUser) {
  if (!user) throw new Error("Sign in first.");
  const settings = typeof location === "undefined" ? undefined : { url: new URL("/account?verified=1", location.href).href };
  await sendEmailVerification(user, settings);
}

// After the link is clicked: reload the user and refresh the ID token so the server sees
// email_verified. Returns whether the address is confirmed now.
async function refreshVerification() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return false;
  await user.reload();
  if (user.emailVerified) {
    await user.getIdToken(true);
    currentUser = user;
    notify(user);
  }
  return user.emailVerified;
}

async function resetPassword(email: string) {
  const value = String(email || "").trim();
  if (!value.includes("@")) throw new Error("Enter your email address first.");
  await sendPasswordResetEmail(auth, value);
}

// Matches the hint shown on the sign-up form.
function passwordProblems(password: string) {
  const missing: string[] = [];
  if (password.length < 8) missing.push("at least 8 characters");
  if (!/[a-z]/.test(password)) missing.push("a lowercase letter");
  if (!/[A-Z]/.test(password)) missing.push("an uppercase letter");
  if (!/[0-9]/.test(password)) missing.push("a number");
  if (!/[^A-Za-z0-9]/.test(password)) missing.push("a symbol");
  return missing;
}

async function signUpWithEmail(email: string, password: string, displayName = "") {
  const local = passwordProblems(password);
  if (local.length) {
    const err: any = new Error(`Password needs ${local.join(", ")}.`);
    err.code = "auth/password-does-not-meet-requirements";
    throw err;
  }
  let validation: any = null;
  try {
    validation = await validatePassword(auth, password);
  } catch (err) {
    // The auth emulator (and projects without a password policy endpoint) cannot
    // report a policy. The local check above still applies; the server enforces the rest.
    console.info("Password policy check skipped:", errorLabel(err));
  }
  if (validation && !validation.isValid) {
    const missing = [];
    const policy = validation.passwordPolicy?.customStrengthOptions || {};
    if (validation.meetsMinPasswordLength === false) missing.push(`at least ${policy.minPasswordLength || 6} characters`);
    if (validation.meetsMaxPasswordLength === false) missing.push(`no more than ${policy.maxPasswordLength} characters`);
    if (validation.containsLowercaseLetter === false) missing.push("a lowercase letter");
    if (validation.containsUppercaseLetter === false) missing.push("an uppercase letter");
    if (validation.containsNumericCharacter === false) missing.push("a number");
    if (validation.containsNonAlphanumericCharacter === false) missing.push("a symbol");
    const err: any = new Error(missing.length ? `Password needs ${missing.join(", ")}.` : "Please choose a stronger password.");
    err.code = "auth/password-does-not-meet-requirements";
    throw err;
  }
  const normalizedEmail = String(email || "").trim().toLowerCase();
  await auth.authStateReady();
  if (auth.currentUser?.isAnonymous) {
    const cred = EmailAuthProvider.credential(normalizedEmail, password);
    const res = await linkWithCredential(auth.currentUser, cred);
    if (displayName) {
      await updateProfile(res.user, { displayName });
    }
    await sendVerification(res.user).catch((err) => console.warn("Atom Bowl: verification email failed", err));
    return res.user;
  }

  const res = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  if (displayName) {
    await updateProfile(res.user, { displayName });
  }
  await sendVerification(res.user).catch((err) => console.warn("Atom Bowl: verification email failed", err));
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

  if (!(await isUsernameAvailable(username))) {
    const err: any = new Error("That username is already taken. Try another one.");
    err.code = "atom/username-taken";
    throw err;
  }
  signupInProgress = true;
  let user: any = null;
  try {
    user = await signUpWithEmail(email, password, playerName || username);

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
        const err: any = new Error("that username was just taken");
        err.code = "atom/username-taken";
        throw err;
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
    if (user && auth.currentUser?.uid === user.uid && !auth.currentUser.isAnonymous) {
      // The login exists now. Save the names without the username so nothing typed is lost,
      // and tell the person to pick a username on the account page.
      console.warn("Atom Bowl: profile setup after sign-up failed", err);
      try {
        await setDoc(usersRef(user.uid), {
          profile: {
            username: "", displayName: playerName || username, playerName: playerName || username,
            firstName, lastName, email, phone, photoURL: user?.photoURL || ""
          },
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp()
        }, { merge: true });
      } catch (saveErr) {
        console.warn("Atom Bowl: fallback profile save failed", saveErr);
      }
      const wrapped: any = new Error(`Your account was created and you are signed in, but the username "${username}" could not be saved (${errorLabel(err)}). Choose a username on your account page.`);
      wrapped.code = "atom/profile-partial";
      throw wrapped;
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
  if (patch.username && !username) throw new Error("Usernames are 3 to 20 lowercase letters or numbers.");
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
      if (name.exists() && name.data()?.uid !== user.uid) throw new Error("That username is already taken. Try another one.");
      tx.set(nameRef, { uid: user.uid, username });
      next.username = username;
    }
    tx.set(ref, { profile: next, updatedAt: serverTimestamp() }, { merge: true });
  });
  if (currentUser?.uid === user.uid) currentProfile = next;
  if (next.playerName) setLocalName(next.playerName);
  try {
    await updateProfile(user, {
      displayName: next.playerName || next.displayName || "",
      ...(!next.photoURL?.startsWith("data:") ? { photoURL: next.photoURL || "" } : {})
    });
  } catch (err) {
    console.warn("Atom Bowl: auth display name update failed (profile doc was saved)", err);
  }
  // Let the site chip and other listeners pick up the new name and photo.
  if (currentUser?.uid === user.uid) notify(currentUser);
  return next;
}

async function signOut() {
  await fbSignOut(auth);
}

function authKey(user: any) {
  if (!user) return "none";
  return `${user.uid}:${user.isAnonymous ? "anon" : "full"}`;
}

function markReady() {
  if (ready) return;
  ready = true;
  resolveReady();
}

async function refreshAccount(user: any) {
  const generation = ++authGeneration;
  lastAuthKey = authKey(user);
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
  if (!currentUser) { markReady(); notify(null); return; }
  // A plain read is much faster than the transaction below, so a returning user's page
  // renders from it and the sync finishes in the background.
  try {
    const existing = await loadUserProfile(user.uid);
    if (existing && generation === authGeneration && auth.currentUser?.uid === user.uid) {
      currentProfile = existing;
      markReady();
      notify(currentUser);
    }
  } catch {}
  try {
    const profile = await ensureUserDoc(user);
    if (generation !== authGeneration || auth.currentUser?.uid !== user.uid) return;
    currentProfile = profile;
    await syncSettings(user);
    if (generation !== authGeneration) return;
    await syncBuzzerProfile(user);
  } catch (err) {
    if (generation !== authGeneration) return;
    syncError = `Signed in, but your profile could not be loaded or synced (${errorLabel(err)}). Check your connection and try again.`;
    console.warn("Account sync failed", err);
  }
  if (generation === authGeneration) {
    markReady();
    notify(currentUser);
  }
}

async function retrySync() {
  await auth.authStateReady();
  await refreshAccount(auth.currentUser);
}

// onIdTokenChanged (not onAuthStateChanged) so that linking an anonymous buzzer-room
// user to Google or email, which keeps the same uid, still refreshes the account.
// Hourly token refreshes have the same key and are ignored.
onIdTokenChanged(auth, (user: any) => {
  if (signupInProgress) return;
  if (authKey(user) === lastAuthKey) return;
  void refreshAccount(user);
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
  needsEmailVerification,
  sendVerification,
  refreshVerification,
  getSyncError: () => syncError,
  getLastWriteError,
  clearLastWriteError,
  retrySync,
  whenReady,
  isReady,
  passwordProblems,
  updateAccountProfile,
  loadBuzzerProfile,
  saveBuzzerProfile,
  getLocalName,
  setLocalName,
  loadLearnProgress,
  saveLearnProgress
};
