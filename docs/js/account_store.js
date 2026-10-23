// @ts-nocheck
import { auth, db } from "./firebase.js";
// @ts-ignore
import { GoogleAuthProvider, OAuthProvider, EmailAuthProvider, signInWithPopup, signInWithCredential, linkWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, linkWithCredential, signOut as fbSignOut, onIdTokenChanged, updateProfile, sendPasswordResetEmail, sendEmailVerification, validatePassword } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
// @ts-ignore
import { doc, getDoc, setDoc, serverTimestamp, increment, arrayUnion, runTransaction } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
const SETTINGS_KEY = "atom_settings_v1";
const BUZZER_PROFILE_KEY = "atom_buzzer_profile";
const GUEST_TAG_KEY = "atom_guest_tag_v1";
const WRITE_ERROR_KEY = "atom_sync_error_v1";
// Last signed-in name and photo, so pages can show them before Firebase loads (common.ts reads it).
const ACCOUNT_HINT_KEY = "atom_account_hint_v1";
let currentUser = null;
let syncError = "";
let signupInProgress = false;
let authGeneration = 0;
let currentProfile = null;
let lastAuthKey = null;
let ready = false;
let resolveReady = () => { };
const readyPromise = new Promise((resolve) => { resolveReady = resolve; });
const listeners = new Set();
// Resolves once the first auth state has been read and the account (if any) loaded.
// Callers that load this module lazily should await it before calling getUser().
function whenReady() {
    return readyPromise;
}
function isReady() {
    return ready;
}
function errorLabel(err) {
    const code = String((err === null || err === void 0 ? void 0 : err.code) || "").replace(/^(auth|firestore)\//, "");
    return code || String((err === null || err === void 0 ? void 0 : err.message) || err || "unknown error");
}
// Writes from other pages (practice stats, settings, buzzer name, lessons) often run
// in fire-and-forget code. Record failures so the account page can show them.
function recordWriteError(what, err) {
    console.warn(`Atom Bowl: saving ${what} failed`, err);
    try {
        localStorage.setItem(WRITE_ERROR_KEY, JSON.stringify({
            what, code: errorLabel(err), at: Date.now(), uid: (currentUser === null || currentUser === void 0 ? void 0 : currentUser.uid) || ""
        }));
    }
    catch { }
}
function clearWriteError(what) {
    try {
        const prev = safeJsonParse(localStorage.getItem(WRITE_ERROR_KEY));
        if (prev && prev.what === what)
            localStorage.removeItem(WRITE_ERROR_KEY);
    }
    catch { }
}
function getLastWriteError() {
    try {
        const prev = safeJsonParse(localStorage.getItem(WRITE_ERROR_KEY));
        if (!prev || !prev.what)
            return null;
        if ((currentUser === null || currentUser === void 0 ? void 0 : currentUser.uid) && prev.uid && prev.uid !== currentUser.uid)
            return null;
        return prev;
    }
    catch {
        return null;
    }
}
function clearLastWriteError() {
    try {
        localStorage.removeItem(WRITE_ERROR_KEY);
    }
    catch { }
}
async function trackedWrite(what, write) {
    try {
        await write();
        clearWriteError(what);
    }
    catch (err) {
        recordWriteError(what, err);
        throw err;
    }
}
function saveHint(user) {
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
    }
    catch { }
}
function notify(user) {
    if (ready)
        saveHint(user);
    listeners.forEach((cb) => {
        try {
            cb(user);
        }
        catch { }
    });
}
function getUser() {
    return currentUser;
}
function getProfile() {
    return currentProfile || null;
}
function onAuthChange(cb) {
    listeners.add(cb);
    cb(currentUser);
    return () => listeners.delete(cb);
}
function safeJsonParse(raw) {
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function normalizeUsername(username) {
    return String(username || "").trim().toLowerCase();
}
function sanitizeUsername(username) {
    const clean = normalizeUsername(username);
    return /^[a-z0-9]{3,20}$/.test(clean) ? clean : "";
}
function usersRef(uid) {
    return doc(db, "users", uid);
}
function usernameRef(username) {
    return doc(db, "usernames", sanitizeUsername(username));
}
function settingsRef(uid) {
    return doc(db, "users", uid, "settings", "current");
}
function buzzerProfileRef(uid) {
    return doc(db, "users", uid, "buzzerProfile", "current");
}
function statsRef(uid) {
    return doc(db, "users", uid, "stats", "lifetime");
}
function randomAlphaNum(size) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let out = "";
    for (let i = 0; i < size; i += 1) {
        out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
}
function getGuestTag() {
    let existing = "";
    try {
        existing = (localStorage.getItem(GUEST_TAG_KEY) || "").trim();
    }
    catch { }
    if (existing && /^[A-Za-z0-9]{12}$/.test(existing))
        return existing;
    const tag = randomAlphaNum(12);
    try {
        localStorage.setItem(GUEST_TAG_KEY, tag);
    }
    catch { }
    return tag;
}
// The name shown in buzzer rooms, kept in this browser for guests and signed-in players alike.
function getLocalName() {
    const saved = safeJsonParse(localStorage.getItem(BUZZER_PROFILE_KEY));
    return String((saved === null || saved === void 0 ? void 0 : saved.name) || "").trim().slice(0, 40);
}
function setLocalName(name) {
    const clean = String(name || "").trim().slice(0, 40);
    try {
        const saved = safeJsonParse(localStorage.getItem(BUZZER_PROFILE_KEY)) || {};
        localStorage.setItem(BUZZER_PROFILE_KEY, JSON.stringify({ ...saved, name: clean, team: (saved === null || saved === void 0 ? void 0 : saved.team) || "A" }));
    }
    catch { }
    return clean;
}
async function loadUserProfile(uid) {
    if (!uid)
        return null;
    const snap = await getDoc(usersRef(uid));
    if (!snap.exists())
        return null;
    const data = snap.data() || {};
    return data.profile || null;
}
async function ensureUserDoc(user) {
    if (!(user === null || user === void 0 ? void 0 : user.uid))
        return;
    const providerIds = Array.isArray(user.providerData)
        ? user.providerData.map((p) => p === null || p === void 0 ? void 0 : p.providerId).filter(Boolean)
        : [];
    return runTransaction(db, async (tx) => {
        var _a;
        const ref = usersRef(user.uid);
        const snap = await tx.get(ref);
        const profile = {
            username: "", displayName: user.displayName || "",
            playerName: user.displayName || "", firstName: "", lastName: "",
            email: user.email || "", phone: "", photoURL: user.photoURL || "",
            ...(((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.profile) || {}), providerIds
        };
        tx.set(ref, {
            profile,
            ...(!snap.exists() ? { createdAt: serverTimestamp() } : {}),
            lastLoginAt: serverTimestamp()
        }, { merge: true });
        return profile;
    });
}
async function isUsernameAvailable(username) {
    var _a;
    const clean = sanitizeUsername(username);
    if (!clean || clean.length < 3 || clean.length > 20)
        return false;
    const snap = await getDoc(usernameRef(clean));
    if (!snap.exists())
        return true;
    if (!(currentUser === null || currentUser === void 0 ? void 0 : currentUser.uid))
        return false;
    return ((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.uid) === currentUser.uid;
}
async function loadRemoteSettings() {
    if (!(currentUser === null || currentUser === void 0 ? void 0 : currentUser.uid))
        return null;
    const ref = settingsRef(currentUser.uid);
    const snap = await getDoc(ref);
    if (!snap.exists())
        return null;
    const data = snap.data();
    return (data === null || data === void 0 ? void 0 : data.value) || null;
}
async function syncSettings(user) {
    var _a, _b;
    if (!(user === null || user === void 0 ? void 0 : user.uid))
        return;
    const ref = settingsRef(user.uid);
    const snap = await getDoc(ref);
    if (((_a = auth.currentUser) === null || _a === void 0 ? void 0 : _a.uid) !== user.uid)
        return;
    const local = safeJsonParse(localStorage.getItem(SETTINGS_KEY));
    if (snap.exists() && ((_b = snap.data()) === null || _b === void 0 ? void 0 : _b.value)) {
        const value = snap.data().value;
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
        }
        catch { }
        window.atomSettings = value;
        document.dispatchEvent(new CustomEvent("atomSettingsSynced", { detail: value }));
        return;
    }
    if (local) {
        await setDoc(ref, { value: local, updatedAt: serverTimestamp() }, { merge: true });
    }
}
async function saveSettings(settings) {
    await whenReady();
    if (!(currentUser === null || currentUser === void 0 ? void 0 : currentUser.uid))
        return;
    const ref = settingsRef(currentUser.uid);
    await trackedWrite("settings", () => setDoc(ref, { value: settings, updatedAt: serverTimestamp() }, { merge: true }));
}
async function loadBuzzerProfile() {
    if (!(currentUser === null || currentUser === void 0 ? void 0 : currentUser.uid))
        return null;
    const ref = buzzerProfileRef(currentUser.uid);
    const snap = await getDoc(ref);
    if (!snap.exists())
        return null;
    return snap.data() || null;
}
async function syncBuzzerProfile(user) {
    var _a;
    if (!(user === null || user === void 0 ? void 0 : user.uid))
        return;
    const ref = buzzerProfileRef(user.uid);
    const snap = await getDoc(ref);
    if (((_a = auth.currentUser) === null || _a === void 0 ? void 0 : _a.uid) !== user.uid)
        return;
    const local = safeJsonParse(localStorage.getItem(BUZZER_PROFILE_KEY));
    if (snap.exists()) {
        const value = snap.data() || {};
        try {
            localStorage.setItem(BUZZER_PROFILE_KEY, JSON.stringify({
                name: (value === null || value === void 0 ? void 0 : value.name) || "",
                team: (value === null || value === void 0 ? void 0 : value.team) || "A"
            }));
        }
        catch { }
        return;
    }
    if (local) {
        await setDoc(ref, {
            name: (local === null || local === void 0 ? void 0 : local.name) || "",
            team: (local === null || local === void 0 ? void 0 : local.team) || "A",
            updatedAt: serverTimestamp()
        }, { merge: true });
    }
}
async function saveBuzzerProfile(profile) {
    await whenReady();
    if (!(currentUser === null || currentUser === void 0 ? void 0 : currentUser.uid))
        return;
    const ref = buzzerProfileRef(currentUser.uid);
    await trackedWrite("buzzer name", () => setDoc(ref, {
        name: (profile === null || profile === void 0 ? void 0 : profile.name) || "",
        team: (profile === null || profile === void 0 ? void 0 : profile.team) || "A",
        updatedAt: serverTimestamp()
    }, { merge: true }));
}
async function loadPracticeStats() {
    if (!(currentUser === null || currentUser === void 0 ? void 0 : currentUser.uid))
        return null;
    const snap = await getDoc(statsRef(currentUser.uid));
    if (!snap.exists())
        return null;
    return snap.data() || null;
}
async function updatePracticeStats(patch) {
    await whenReady();
    if (!(currentUser === null || currentUser === void 0 ? void 0 : currentUser.uid))
        return;
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
function learnProgressRef(uid) {
    return doc(db, "users", uid, "learn", "progress");
}
async function loadLearnProgress() {
    var _a;
    if (!(currentUser === null || currentUser === void 0 ? void 0 : currentUser.uid))
        return null;
    const snap = await getDoc(learnProgressRef(currentUser.uid));
    if (!snap.exists())
        return null;
    return Array.isArray((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.completedLessons) ? snap.data().completedLessons : null;
}
async function saveLearnProgress(completedLessons) {
    await whenReady();
    if (!(currentUser === null || currentUser === void 0 ? void 0 : currentUser.uid))
        return;
    const ref = learnProgressRef(currentUser.uid);
    await trackedWrite("lesson progress", () => setDoc(ref, {
        completedLessons: arrayUnion(...completedLessons), updatedAt: serverTimestamp()
    }, { merge: true }));
}
function buildProvider(providerId) {
    if (providerId === "google")
        return new GoogleAuthProvider();
    return null;
}
async function signInWithProvider(providerId) {
    var _a;
    await auth.authStateReady();
    const provider = buildProvider(providerId);
    if (!provider)
        throw new Error("unknown-provider");
    if ((_a = auth.currentUser) === null || _a === void 0 ? void 0 : _a.isAnonymous) {
        try {
            const res = await linkWithPopup(auth.currentUser, provider);
            // Linking keeps the uid, so onAuthStateChanged-style listeners never fire.
            await refreshAccount(res.user);
            return res.user;
        }
        catch (err) {
            const code = (err === null || err === void 0 ? void 0 : err.code) || "";
            if (code === "auth/credential-already-in-use") {
                const credential = providerId === "google"
                    ? GoogleAuthProvider.credentialFromError(err) : OAuthProvider.credentialFromError(err);
                if (!credential)
                    throw err;
                const res = await signInWithCredential(auth, credential);
                return res.user;
            }
            throw err;
        }
    }
    const res = await signInWithPopup(auth, provider);
    return res.user;
}
async function signInWithEmail(email, password) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail)
        throw new Error("Email is required.");
    const res = await signInWithEmailAndPassword(auth, normalizedEmail, password);
    return res.user;
}
async function signInWithIdentifier(identifier, password) {
    if (!String(identifier).includes("@"))
        throw new Error("Please sign in with your email address.");
    return signInWithEmail(identifier, password);
}
// Email/password accounts must confirm their address before Tutor and Generate work (the `ai`
// server checks the token's email_verified), so new accounts can't be made just for credits.
function needsEmailVerification(user = currentUser) {
    if (!user || user.isAnonymous || user.emailVerified)
        return false;
    const providers = (user.providerData || []).map((p) => p === null || p === void 0 ? void 0 : p.providerId);
    return providers.includes("password");
}
async function sendVerification(user = auth.currentUser) {
    if (!user)
        throw new Error("Sign in first.");
    const settings = typeof location === "undefined" ? undefined : { url: new URL("/account?verified=1", location.href).href };
    await sendEmailVerification(user, settings);
}
// After the link is clicked: reload the user and refresh the ID token so the server sees
// email_verified. Returns whether the address is confirmed now.
async function refreshVerification() {
    const user = auth.currentUser;
    if (!user || user.isAnonymous)
        return false;
    await user.reload();
    if (user.emailVerified) {
        await user.getIdToken(true);
        currentUser = user;
        notify(user);
    }
    return user.emailVerified;
}
async function resetPassword(email) {
    const value = String(email || "").trim();
    if (!value.includes("@"))
        throw new Error("Enter your email address first.");
    await sendPasswordResetEmail(auth, value);
}
// Matches the hint shown on the sign-up form.
function passwordProblems(password) {
    const missing = [];
    if (password.length < 8)
        missing.push("at least 8 characters");
    if (!/[a-z]/.test(password))
        missing.push("a lowercase letter");
    if (!/[A-Z]/.test(password))
        missing.push("an uppercase letter");
    if (!/[0-9]/.test(password))
        missing.push("a number");
    if (!/[^A-Za-z0-9]/.test(password))
        missing.push("a symbol");
    return missing;
}
async function signUpWithEmail(email, password, displayName = "") {
    var _a, _b;
    const local = passwordProblems(password);
    if (local.length) {
        const err = new Error(`Password needs ${local.join(", ")}.`);
        err.code = "auth/password-does-not-meet-requirements";
        throw err;
    }
    let validation = null;
    try {
        validation = await validatePassword(auth, password);
    }
    catch (err) {
        // The auth emulator (and projects without a password policy endpoint) cannot
        // report a policy. The local check above still applies; the server enforces the rest.
        console.info("Password policy check skipped:", errorLabel(err));
    }
    if (validation && !validation.isValid) {
        const missing = [];
        const policy = ((_a = validation.passwordPolicy) === null || _a === void 0 ? void 0 : _a.customStrengthOptions) || {};
        if (validation.meetsMinPasswordLength === false)
            missing.push(`at least ${policy.minPasswordLength || 6} characters`);
        if (validation.meetsMaxPasswordLength === false)
            missing.push(`no more than ${policy.maxPasswordLength} characters`);
        if (validation.containsLowercaseLetter === false)
            missing.push("a lowercase letter");
        if (validation.containsUppercaseLetter === false)
            missing.push("an uppercase letter");
        if (validation.containsNumericCharacter === false)
            missing.push("a number");
        if (validation.containsNonAlphanumericCharacter === false)
            missing.push("a symbol");
        const err = new Error(missing.length ? `Password needs ${missing.join(", ")}.` : "Please choose a stronger password.");
        err.code = "auth/password-does-not-meet-requirements";
        throw err;
    }
    const normalizedEmail = String(email || "").trim().toLowerCase();
    await auth.authStateReady();
    if ((_b = auth.currentUser) === null || _b === void 0 ? void 0 : _b.isAnonymous) {
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
async function signUpWithDetails(details) {
    var _a;
    const firstName = String((details === null || details === void 0 ? void 0 : details.firstName) || "").trim();
    const lastName = String((details === null || details === void 0 ? void 0 : details.lastName) || "").trim();
    const email = String((details === null || details === void 0 ? void 0 : details.email) || "").trim().toLowerCase();
    const phone = String((details === null || details === void 0 ? void 0 : details.phone) || "").trim();
    const username = sanitizeUsername((details === null || details === void 0 ? void 0 : details.username) || "");
    const password = String((details === null || details === void 0 ? void 0 : details.password) || "");
    const playerName = String((details === null || details === void 0 ? void 0 : details.playerName) || `${firstName} ${lastName}` || "").trim();
    if (!firstName || !lastName || !email || !username || !password) {
        throw new Error("Please complete all required fields.");
    }
    if (!(await isUsernameAvailable(username))) {
        const err = new Error("That username is already taken. Try another one.");
        err.code = "atom/username-taken";
        throw err;
    }
    signupInProgress = true;
    let user = null;
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
            photoURL: (user === null || user === void 0 ? void 0 : user.photoURL) || ""
        };
        await runTransaction(db, async (tx) => {
            var _a;
            const nameRef = usernameRef(username);
            const name = await tx.get(nameRef);
            const userRef = usersRef(user.uid);
            const existing = await tx.get(userRef);
            if (name.exists() && ((_a = name.data()) === null || _a === void 0 ? void 0 : _a.uid) !== user.uid) {
                const err = new Error("that username was just taken");
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
    }
    catch (err) {
        if (user && ((_a = auth.currentUser) === null || _a === void 0 ? void 0 : _a.uid) === user.uid && !auth.currentUser.isAnonymous) {
            // The login exists now. Save the names without the username so nothing typed is lost,
            // and tell the person to pick a username on the account page.
            console.warn("Atom Bowl: profile setup after sign-up failed", err);
            try {
                await setDoc(usersRef(user.uid), {
                    profile: {
                        username: "", displayName: playerName || username, playerName: playerName || username,
                        firstName, lastName, email, phone, photoURL: (user === null || user === void 0 ? void 0 : user.photoURL) || ""
                    },
                    createdAt: serverTimestamp(),
                    lastLoginAt: serverTimestamp()
                }, { merge: true });
            }
            catch (saveErr) {
                console.warn("Atom Bowl: fallback profile save failed", saveErr);
            }
            const wrapped = new Error(`Your account was created and you are signed in, but the username "${username}" could not be saved (${errorLabel(err)}). Choose a username on your account page.`);
            wrapped.code = "atom/profile-partial";
            throw wrapped;
        }
        throw err;
    }
    finally {
        signupInProgress = false;
        await refreshAccount(auth.currentUser);
    }
}
async function updateAccountProfile(patch) {
    var _a;
    if (!(currentUser === null || currentUser === void 0 ? void 0 : currentUser.uid))
        throw new Error("Not signed in.");
    if ((patch === null || patch === void 0 ? void 0 : patch.photoURL) && patch.photoURL.length > 400000)
        throw new Error("Profile image is too large. Choose an image under 250 KB.");
    const user = currentUser;
    const prev = currentProfile || (await loadUserProfile(user.uid)) || {};
    const next = {
        ...prev,
        playerName: (patch === null || patch === void 0 ? void 0 : patch.playerName) != null ? String(patch.playerName).trim() : (prev.playerName || ""),
        displayName: (patch === null || patch === void 0 ? void 0 : patch.playerName) != null ? String(patch.playerName).trim() : (prev.displayName || ""),
        firstName: (patch === null || patch === void 0 ? void 0 : patch.firstName) != null ? String(patch.firstName).trim() : (prev.firstName || ""),
        lastName: (patch === null || patch === void 0 ? void 0 : patch.lastName) != null ? String(patch.lastName).trim() : (prev.lastName || ""),
        phone: (patch === null || patch === void 0 ? void 0 : patch.phone) != null ? String(patch.phone).trim() : (prev.phone || ""),
        photoURL: (patch === null || patch === void 0 ? void 0 : patch.photoURL) != null ? String(patch.photoURL).trim() : (prev.photoURL || "")
    };
    const username = patch.username ? sanitizeUsername(patch.username) : prev.username;
    if (patch.username && !username)
        throw new Error("Usernames are 3 to 20 lowercase letters or numbers.");
    if (prev.username && username !== prev.username)
        throw new Error("Your username cannot be changed.");
    await runTransaction(db, async (tx) => {
        var _a, _b, _c;
        const ref = usersRef(user.uid);
        const existing = await tx.get(ref);
        if (((_b = (_a = existing.data()) === null || _a === void 0 ? void 0 : _a.profile) === null || _b === void 0 ? void 0 : _b.username) && existing.data().profile.username !== username) {
            throw new Error("Your profile changed. Reload before saving.");
        }
        if (username && !prev.username) {
            const nameRef = usernameRef(username);
            const name = await tx.get(nameRef);
            if (name.exists() && ((_c = name.data()) === null || _c === void 0 ? void 0 : _c.uid) !== user.uid)
                throw new Error("That username is already taken. Try another one.");
            tx.set(nameRef, { uid: user.uid, username });
            next.username = username;
        }
        tx.set(ref, { profile: next, updatedAt: serverTimestamp() }, { merge: true });
    });
    if ((currentUser === null || currentUser === void 0 ? void 0 : currentUser.uid) === user.uid)
        currentProfile = next;
    if (next.playerName)
        setLocalName(next.playerName);
    try {
        await updateProfile(user, {
            displayName: next.playerName || next.displayName || "",
            ...(!((_a = next.photoURL) === null || _a === void 0 ? void 0 : _a.startsWith("data:")) ? { photoURL: next.photoURL || "" } : {})
        });
    }
    catch (err) {
        console.warn("Atom Bowl: auth display name update failed (profile doc was saved)", err);
    }
    // Let the site chip and other listeners pick up the new name and photo.
    if ((currentUser === null || currentUser === void 0 ? void 0 : currentUser.uid) === user.uid)
        notify(currentUser);
    return next;
}
async function signOut() {
    await fbSignOut(auth);
}
function authKey(user) {
    if (!user)
        return "none";
    return `${user.uid}:${user.isAnonymous ? "anon" : "full"}`;
}
function markReady() {
    if (ready)
        return;
    ready = true;
    resolveReady();
}
async function refreshAccount(user) {
    var _a, _b;
    const generation = ++authGeneration;
    lastAuthKey = authKey(user);
    const owner = user && !user.isAnonymous ? user.uid : "guest";
    try {
        const previous = localStorage.getItem("atom_cache_owner");
        if (previous && previous !== owner && previous !== "guest") {
            for (const key of [SETTINGS_KEY, BUZZER_PROFILE_KEY, "atom_learn_progress_v1"])
                localStorage.removeItem(key);
            document.dispatchEvent(new CustomEvent("atomSettingsSynced", { detail: {} }));
        }
        localStorage.setItem("atom_cache_owner", owner);
    }
    catch { }
    currentUser = user && !user.isAnonymous ? user : null;
    currentProfile = null;
    syncError = "";
    if (!currentUser) {
        markReady();
        notify(null);
        return;
    }
    // A plain read is much faster than the transaction below, so a returning user's page
    // renders from it and the sync finishes in the background.
    try {
        const existing = await loadUserProfile(user.uid);
        if (existing && generation === authGeneration && ((_a = auth.currentUser) === null || _a === void 0 ? void 0 : _a.uid) === user.uid) {
            currentProfile = existing;
            markReady();
            notify(currentUser);
        }
    }
    catch { }
    try {
        const profile = await ensureUserDoc(user);
        if (generation !== authGeneration || ((_b = auth.currentUser) === null || _b === void 0 ? void 0 : _b.uid) !== user.uid)
            return;
        currentProfile = profile;
        await syncSettings(user);
        if (generation !== authGeneration)
            return;
        await syncBuzzerProfile(user);
    }
    catch (err) {
        if (generation !== authGeneration)
            return;
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
onIdTokenChanged(auth, (user) => {
    if (signupInProgress)
        return;
    if (authKey(user) === lastAuthKey)
        return;
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
//# sourceMappingURL=account_store.js.map