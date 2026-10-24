var _a, _b;
import "./account_store.js";
const $ = (id) => document.getElementById(id);
const statusText = $("statusText");
const statusSub = $("statusSub");
const guestTagEl = $("guestTag");
const guestRow = (_a = guestTagEl === null || guestTagEl === void 0 ? void 0 : guestTagEl.closest) === null || _a === void 0 ? void 0 : _a.call(guestTagEl, ".guest-row");
const profileUsername = $("profileUsername");
const profileUsernameRow = $("profileUsernameRow");
const profilePlayerName = $("profilePlayerName");
const profileEmail = $("profileEmail");
const profilePhoto = $("profilePhoto");
const profileInitial = $("profileInitial");
const signedOutActions = $("signedOutActions");
const signedOutAuthRow = $("signedOutAuthRow");
const signedInPanel = $("signedInPanel");
const signOutBtn = $("signOutBtn");
const syncNotice = $("syncNotice");
const verifyNotice = $("verifyNotice");
const verifyNoticeText = $("verifyNoticeText");
const verifyResendBtn = $("verifyResendBtn");
const verifyCheckBtn = $("verifyCheckBtn");
const syncNoticeText = $("syncNoticeText");
const retrySyncBtn = $("retrySyncBtn");
const toastEl = $("accountToast");
const playerNameInput = $("playerNameInput");
const firstNameInput = $("firstNameInput");
const lastNameInput = $("lastNameInput");
const phoneInput = $("phoneInput");
const usernameLockedInput = $("usernameLockedInput");
const usernameLockedHint = $("usernameLockedHint");
const emailLockedInput = $("emailLockedInput");
const photoUploadInput = $("photoUploadInput");
const photoHint = $("photoHint");
const saveProfileBtn = $("saveProfileBtn");
const accountErrorEl = $("accountError");
const accountStatusEl = $("accountStatus");
const statRuns = $("statRuns");
const statAvgScore = $("statAvgScore");
const statTimePlayed = $("statTimePlayed");
const statAccuracy = $("statAccuracy");
const statsNote = $("statsNote");
const authModal = $("authModal");
const closeAuthModalBtn = $("closeAuthModal");
const openSignInBtn = $("openSignInBtn");
const openSignUpBtn = $("openSignUpBtn");
const showSignInTab = $("showSignInTab");
const showSignUpTab = $("showSignUpTab");
const signInFormPanel = $("signInFormPanel");
const signUpFormPanel = $("signUpFormPanel");
const authModalTitle = $("authModalTitle");
const gotoSignupLink = $("gotoSignupLink");
const gotoSigninLink = $("gotoSigninLink");
const authError = $("authError");
const authStatus = $("authStatus");
const usernameStatus = $("usernameStatus");
const googleBtn = $("googleBtn");
const signinIdentifierInput = $("signinIdentifierInput");
const signinPasswordInput = $("signinPasswordInput");
const signinBtn = $("signinBtn");
const resetPasswordBtn = $("resetPasswordBtn");
const signupFirstName = $("signupFirstName");
const signupLastName = $("signupLastName");
const signupEmail = $("signupEmail");
const signupPhone = $("signupPhone");
const signupUsername = $("signupUsername");
const signupPlayerName = $("signupPlayerName");
const guestNameForm = $("guestNameForm");
const guestNameInput = $("guestNameInput");
const guestNameHint = $("guestNameHint");
const signupPassword = $("signupPassword");
const signupPassword2 = $("signupPassword2");
const signupBtn = $("signupBtn");
const USERNAME_RE = /^[a-z0-9]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let pendingPhotoData = "";
let lastFocus = null;
let toastTimer = 0;
// The shared Window typing in globals.d.ts predates the newer store helpers.
function requireAccount() {
    const account = window.atomAccount;
    if (!account)
        throw new Error("The account module did not load. Check your connection and reload the page.");
    return account;
}
/* ---------- Messages ---------- */
function setAuthError(msg = "") {
    if (authError)
        authError.textContent = msg;
    if (msg && authStatus)
        authStatus.textContent = "";
}
function setAuthStatus(msg = "") {
    if (authStatus)
        authStatus.textContent = msg;
    if (msg && authError)
        authError.textContent = "";
}
function setAccountError(msg = "") {
    if (accountErrorEl)
        accountErrorEl.textContent = msg;
    if (msg && accountStatusEl)
        accountStatusEl.textContent = "";
}
function setAccountStatus(msg = "") {
    if (accountStatusEl)
        accountStatusEl.textContent = msg;
}
function showToast(msg) {
    if (!toastEl)
        return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 3200);
}
const VERIFY_TEXT = "Confirm your email to use Tutor and Generate. We sent a link to your inbox.";
function renderVerifyNotice(user) {
    var _a, _b;
    let needed = false;
    try {
        needed = !!((_b = (_a = requireAccount()).needsEmailVerification) === null || _b === void 0 ? void 0 : _b.call(_a, user));
    }
    catch { }
    verifyNotice === null || verifyNotice === void 0 ? void 0 : verifyNotice.classList.toggle("hidden", !needed);
    if (!needed && verifyNoticeText)
        verifyNoticeText.textContent = VERIFY_TEXT;
}
async function checkVerification({ quiet = false } = {}) {
    var _a, _b, _c, _d;
    try {
        const ok = await ((_b = (_a = requireAccount()).refreshVerification) === null || _b === void 0 ? void 0 : _b.call(_a));
        if (ok) {
            renderVerifyNotice((_d = (_c = requireAccount()).getUser) === null || _d === void 0 ? void 0 : _d.call(_c));
            showToast("Email confirmed. Tutor and Generate are ready.");
        }
        else if (!quiet && verifyNoticeText) {
            verifyNoticeText.textContent = "Not confirmed yet. Open the link in the email, then press I've confirmed it.";
        }
    }
    catch (err) {
        if (!quiet && verifyNoticeText)
            verifyNoticeText.textContent = `Couldn't check (${friendlyAuthError(err)}). Try again.`;
    }
}
function renderSyncNotice() {
    var _a, _b, _c;
    if (!syncNotice || !syncNoticeText)
        return;
    let msg = "";
    try {
        const account = requireAccount();
        if ((_a = account.getUser) === null || _a === void 0 ? void 0 : _a.call(account)) {
            msg = ((_b = account.getSyncError) === null || _b === void 0 ? void 0 : _b.call(account)) || "";
            const writeErr = (_c = account.getLastWriteError) === null || _c === void 0 ? void 0 : _c.call(account);
            if (!msg && writeErr) {
                const when = new Date(Number(writeErr.at) || Date.now()).toLocaleString();
                msg = `Your ${writeErr.what} did not save on ${when} (${writeErr.code}). Check your connection, then try again.`;
            }
        }
    }
    catch { }
    syncNoticeText.textContent = msg;
    syncNotice.classList.toggle("hidden", !msg);
}
/* ---------- Busy state ---------- */
function setBusy(isBusy, active, busyText) {
    document.querySelectorAll("[data-auth-action]").forEach((el) => {
        el.disabled = isBusy;
    });
    if (!active)
        return;
    active.disabled = isBusy;
    const label = active.querySelector(".btn-label") || active;
    if (isBusy) {
        if (active.dataset.idleHtml == null)
            active.dataset.idleHtml = label.innerHTML;
        if (busyText)
            label.textContent = busyText;
        active.setAttribute("aria-busy", "true");
    }
    else {
        if (active.dataset.idleHtml != null)
            label.innerHTML = active.dataset.idleHtml;
        delete active.dataset.idleHtml;
        active.removeAttribute("aria-busy");
    }
}
async function withBusy(button, busyText, task) {
    setBusy(true, button, busyText);
    try {
        return await task();
    }
    finally {
        setBusy(false, button);
    }
}
/* ---------- Errors ---------- */
function friendlyAuthError(err) {
    const code = (err === null || err === void 0 ? void 0 : err.code) || "";
    switch (code) {
        case "auth/user-not-found":
        case "auth/invalid-credential":
        case "auth/invalid-login-credentials":
            return "That email and password don't match an account. Check both, or create an account.";
        case "auth/wrong-password":
            return "Wrong password. Try again, or use \"Forgot password?\" to reset it.";
        case "auth/missing-password":
            return "Enter your password.";
        case "auth/missing-email":
            return "Enter your email address.";
        case "auth/email-already-in-use":
            return "An account with this email already exists. Sign in instead.";
        case "auth/credential-already-in-use":
            return "That sign-in is already linked to another account. Sign in with it instead.";
        case "auth/weak-password":
        case "auth/password-does-not-meet-requirements":
            return (err === null || err === void 0 ? void 0 : err.message) && !String(err.message).startsWith("Firebase:")
                ? err.message
                : "Use 8 or more characters with an uppercase letter, a lowercase letter, a number and a symbol.";
        case "auth/invalid-email":
            return "Enter a valid email address, like you@example.com.";
        case "auth/too-many-requests":
            return "Too many attempts. Wait a few minutes, then try again.";
        case "auth/network-request-failed":
            return "Couldn't reach the sign-in server. Check your connection and try again.";
        case "auth/popup-blocked":
            return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
        case "auth/operation-not-allowed":
            return "This sign-in method isn't turned on for Atom Bowl yet. Use another method.";
        case "auth/unauthorized-domain":
            return "Sign-in isn't allowed from this web address yet. Use atombowl.web.app.";
        case "auth/account-exists-with-different-credential":
            return "This email already uses a different sign-in method. Sign in that way instead.";
        case "auth/popup-closed-by-user":
        case "auth/cancelled-popup-request":
            return "The sign-in window was closed before finishing.";
        case "permission-denied":
        case "firestore/permission-denied":
            return "The server refused to save your profile (permission denied). Reload and try again.";
        case "unavailable":
        case "firestore/unavailable":
            return "Couldn't reach the database. Check your connection and try again.";
        default: {
            const msg = String((err === null || err === void 0 ? void 0 : err.message) || "");
            if (!msg)
                return "Something went wrong. Try again.";
            return msg.replace(/^Firebase:\s*/, "");
        }
    }
}
/* ---------- Rendering ---------- */
function toReadableTime(totalSeconds) {
    const s = Math.max(0, Math.round(Number(totalSeconds || 0)));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0)
        return `${h}h ${m}m`;
    return `${m}m`;
}
function fallbackGuestTag() {
    const key = "atom_guest_tag_v1";
    let existing = "";
    try {
        existing = (localStorage.getItem(key) || "").trim();
    }
    catch { }
    if (/^[A-Za-z0-9]{12}$/.test(existing))
        return existing;
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let tag = "";
    for (let i = 0; i < 12; i += 1)
        tag += chars[Math.floor(Math.random() * chars.length)];
    try {
        localStorage.setItem(key, tag);
    }
    catch { }
    return tag;
}
function setStatusTag(state) {
    if (!statusText)
        return;
    statusText.className = state === "in" ? "tag good" : "tag";
    statusText.textContent = state === "in" ? "Signed in" : state === "out" ? "Signed out" : "Checking sign-in";
}
function setAvatar(photo, name) {
    var _a;
    if (profilePhoto) {
        if (photo)
            profilePhoto.src = photo;
        else
            profilePhoto.removeAttribute("src");
        profilePhoto.classList.toggle("hidden", !photo);
    }
    if (profileInitial) {
        profileInitial.classList.toggle("hidden", !!photo);
        const initial = name.trim().charAt(0).toUpperCase();
        if (initial)
            profileInitial.textContent = initial;
        else
            profileInitial.innerHTML = ((_a = window.atomIcon) === null || _a === void 0 ? void 0 : _a.call(window, "user")) || "";
    }
}
function setStats(stats) {
    const runs = Number((stats === null || stats === void 0 ? void 0 : stats.totalRuns) || 0);
    const answered = Number((stats === null || stats === void 0 ? void 0 : stats.totalAnswered) || 0);
    const correct = Number((stats === null || stats === void 0 ? void 0 : stats.totalCorrect) || 0);
    const totalTime = Number((stats === null || stats === void 0 ? void 0 : stats.totalTime) || 0);
    if (statRuns)
        statRuns.textContent = String(runs);
    if (statAvgScore)
        statAvgScore.textContent = runs > 0 ? (correct / runs).toFixed(1) : "0.0";
    if (statTimePlayed)
        statTimePlayed.textContent = toReadableTime(totalTime);
    if (statAccuracy)
        statAccuracy.textContent = answered > 0 ? `${Math.round((correct / answered) * 100)}%` : "0%";
}
async function renderStats() {
    var _a;
    const account = requireAccount();
    const user = account.getUser();
    try {
        const stats = await ((_a = account.loadPracticeStats) === null || _a === void 0 ? void 0 : _a.call(account));
        if (account.getUser() !== user)
            return;
        setStats(stats);
        if (statsNote) {
            statsNote.className = "status-note";
            statsNote.textContent = Number((stats === null || stats === void 0 ? void 0 : stats.totalRuns) || 0) > 0
                ? "Totals from every solo practice run while signed in."
                : "No runs saved yet. Finish a solo practice run while signed in and it shows up here.";
        }
    }
    catch (err) {
        if (account.getUser() !== user)
            return;
        console.warn("Atom Bowl: loading practice stats failed", err);
        if (statsNote) {
            statsNote.className = "status-note bad";
            statsNote.textContent = `Couldn't load your stats (${String((err === null || err === void 0 ? void 0 : err.code) || (err === null || err === void 0 ? void 0 : err.message) || "error")}). Reload to try again.`;
        }
    }
}
// While Firebase loads, show the last signed-in account from the hint common.ts also uses,
// instead of a guest card that then flips to signed in.
function renderChecking() {
    setStatusTag("checking");
    let hint = null;
    try {
        hint = JSON.parse(localStorage.getItem("atom_account_hint_v1") || "null");
    }
    catch { }
    if (!(hint === null || hint === void 0 ? void 0 : hint.uid)) {
        if (statusSub)
            statusSub.textContent = "Looking for a saved sign-in on this device.";
        return;
    }
    if (statusSub)
        statusSub.textContent = "Loading your account…";
    if (profilePlayerName)
        profilePlayerName.textContent = hint.name || "Player";
    if (profileUsername)
        profileUsername.textContent = hint.username || "";
    profileUsernameRow === null || profileUsernameRow === void 0 ? void 0 : profileUsernameRow.classList.toggle("hidden", !hint.username);
    if (profileEmail)
        profileEmail.textContent = hint.email || "";
    setAvatar(hint.photo || "", hint.name || "");
    signedOutActions === null || signedOutActions === void 0 ? void 0 : signedOutActions.classList.add("hidden");
    signedOutAuthRow === null || signedOutAuthRow === void 0 ? void 0 : signedOutAuthRow.classList.add("hidden");
    guestRow === null || guestRow === void 0 ? void 0 : guestRow.classList.add("hidden");
}
function localName() {
    var _a, _b;
    try {
        return String(((_b = (_a = requireAccount()).getLocalName) === null || _b === void 0 ? void 0 : _b.call(_a)) || "");
    }
    catch {
        return "";
    }
}
function renderSignedOut() {
    var _a, _b;
    const name = localName();
    if (guestNameInput && document.activeElement !== guestNameInput)
        guestNameInput.value = name;
    let tag = "";
    try {
        tag = ((_b = (_a = requireAccount()).getGuestTag) === null || _b === void 0 ? void 0 : _b.call(_a)) || "";
    }
    catch { }
    setStatusTag("out");
    verifyNotice === null || verifyNotice === void 0 ? void 0 : verifyNotice.classList.add("hidden");
    if (statusSub)
        statusSub.textContent = "You're practicing as a guest. Progress stays in this browser only.";
    if (profileUsernameRow)
        profileUsernameRow.classList.add("hidden");
    if (profileUsername)
        profileUsername.textContent = "";
    if (profilePlayerName)
        profilePlayerName.textContent = name || "Guest";
    if (profileEmail)
        profileEmail.textContent = "Not signed in";
    setAvatar("", name);
    if (usernameLockedInput)
        usernameLockedInput.value = "";
    if (emailLockedInput)
        emailLockedInput.value = "";
    if (guestTagEl)
        guestTagEl.textContent = tag || fallbackGuestTag();
    guestRow === null || guestRow === void 0 ? void 0 : guestRow.classList.remove("hidden");
    signedOutActions === null || signedOutActions === void 0 ? void 0 : signedOutActions.classList.remove("hidden");
    signedOutAuthRow === null || signedOutAuthRow === void 0 ? void 0 : signedOutAuthRow.classList.remove("hidden");
    signedInPanel === null || signedInPanel === void 0 ? void 0 : signedInPanel.classList.add("hidden");
    setStats(null);
    if (statsNote) {
        statsNote.className = "status-note";
        statsNote.textContent = "Sign in to keep stats from your practice runs.";
    }
    setAccountError("");
    setAccountStatus("");
    renderSyncNotice();
}
async function renderSignedIn(user) {
    var _a;
    const account = requireAccount();
    const profile = ((_a = account.getProfile) === null || _a === void 0 ? void 0 : _a.call(account)) || {};
    const username = String((profile === null || profile === void 0 ? void 0 : profile.username) || "").trim();
    const playerName = String((profile === null || profile === void 0 ? void 0 : profile.playerName) || (profile === null || profile === void 0 ? void 0 : profile.displayName) || (user === null || user === void 0 ? void 0 : user.displayName) || username || String((user === null || user === void 0 ? void 0 : user.email) || "").split("@")[0] || "Player");
    const email = String((profile === null || profile === void 0 ? void 0 : profile.email) || (user === null || user === void 0 ? void 0 : user.email) || "");
    const photo = String((profile === null || profile === void 0 ? void 0 : profile.photoURL) || (user === null || user === void 0 ? void 0 : user.photoURL) || "");
    setStatusTag("in");
    renderVerifyNotice(user);
    // Arriving from the verification email's continue link.
    if (new URLSearchParams(location.search).get("verified") === "1") {
        history.replaceState(null, "", location.pathname + location.hash);
        void checkVerification({ quiet: true });
    }
    if (statusSub) {
        const providers = Array.isArray(user === null || user === void 0 ? void 0 : user.providerData) ? user.providerData.map((p) => p === null || p === void 0 ? void 0 : p.providerId) : [];
        statusSub.textContent = providers.includes("google.com")
            ? "Signed in with Google. Your stats and settings save to this account."
            : "Signed in with email. Your stats and settings save to this account.";
    }
    guestRow === null || guestRow === void 0 ? void 0 : guestRow.classList.add("hidden");
    if (profileUsername)
        profileUsername.textContent = username;
    profileUsernameRow === null || profileUsernameRow === void 0 ? void 0 : profileUsernameRow.classList.toggle("hidden", !username);
    if (profilePlayerName)
        profilePlayerName.textContent = playerName;
    if (profileEmail)
        profileEmail.textContent = email || "No email on this account";
    setAvatar(pendingPhotoData || photo, playerName);
    signedOutActions === null || signedOutActions === void 0 ? void 0 : signedOutActions.classList.add("hidden");
    signedOutAuthRow === null || signedOutAuthRow === void 0 ? void 0 : signedOutAuthRow.classList.add("hidden");
    signedInPanel === null || signedInPanel === void 0 ? void 0 : signedInPanel.classList.remove("hidden");
    if (playerNameInput)
        playerNameInput.value = playerName;
    if (firstNameInput)
        firstNameInput.value = String((profile === null || profile === void 0 ? void 0 : profile.firstName) || "");
    if (lastNameInput)
        lastNameInput.value = String((profile === null || profile === void 0 ? void 0 : profile.lastName) || "");
    if (phoneInput)
        phoneInput.value = String((profile === null || profile === void 0 ? void 0 : profile.phone) || "");
    if (usernameLockedInput) {
        usernameLockedInput.value = username;
        usernameLockedInput.readOnly = !!username;
        usernameLockedInput.classList.toggle("input-readonly", !!username);
    }
    if (usernameLockedHint) {
        usernameLockedHint.classList.remove("good", "bad");
        usernameLockedHint.textContent = username
            ? "Usernames can't be changed once set."
            : "Pick a username: 3 to 20 lowercase letters or numbers. It can't be changed later.";
    }
    if (emailLockedInput)
        emailLockedInput.value = email;
    renderSyncNotice();
    await renderStats();
}
async function handleAuthChange(user) {
    const account = requireAccount();
    if (account.isReady && !account.isReady()) {
        renderChecking();
        return;
    }
    if (!user || user.isAnonymous) {
        renderSignedOut();
        return;
    }
    await renderSignedIn(user);
}
/* ---------- Auth modal ---------- */
function moveErrorSlot(mode) {
    const slot = document.querySelector(`[data-error-slot="${mode}"]`);
    if (slot && authError && authError.parentElement !== slot) {
        slot.appendChild(authError);
        if (authStatus)
            slot.appendChild(authStatus);
    }
}
function switchAuthPanel(mode) {
    const isSignIn = mode === "signin";
    signInFormPanel === null || signInFormPanel === void 0 ? void 0 : signInFormPanel.classList.toggle("hidden", !isSignIn);
    signUpFormPanel === null || signUpFormPanel === void 0 ? void 0 : signUpFormPanel.classList.toggle("hidden", isSignIn);
    showSignInTab === null || showSignInTab === void 0 ? void 0 : showSignInTab.classList.toggle("active", isSignIn);
    showSignUpTab === null || showSignUpTab === void 0 ? void 0 : showSignUpTab.classList.toggle("active", !isSignIn);
    showSignInTab === null || showSignInTab === void 0 ? void 0 : showSignInTab.setAttribute("aria-selected", String(isSignIn));
    showSignUpTab === null || showSignUpTab === void 0 ? void 0 : showSignUpTab.setAttribute("aria-selected", String(!isSignIn));
    if (authModalTitle)
        authModalTitle.textContent = isSignIn ? "Sign in" : "Create account";
    moveErrorSlot(mode);
    setAuthError("");
    setAuthStatus("");
}
function openAuthModal(mode) {
    if (!authModal)
        return;
    lastFocus = document.activeElement;
    switchAuthPanel(mode);
    if (signupPlayerName && !signupPlayerName.value)
        signupPlayerName.value = localName();
    authModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    // Focusing on a touch screen pops the keyboard over the form before it's been seen.
    if (!window.matchMedia("(pointer: coarse)").matches) {
        const first = mode === "signin" ? signinIdentifierInput : signupFirstName;
        first === null || first === void 0 ? void 0 : first.focus();
    }
}
function closeAuthModal() {
    var _a;
    if (!authModal || authModal.classList.contains("hidden"))
        return;
    authModal.classList.add("hidden");
    document.body.style.overflow = "";
    (_a = lastFocus === null || lastFocus === void 0 ? void 0 : lastFocus.focus) === null || _a === void 0 ? void 0 : _a.call(lastFocus);
}
/* ---------- Sign-up field validation ---------- */
function fieldError(input, msg) {
    if (!input)
        return;
    const el = document.getElementById(`${input.id}Error`);
    if (el)
        el.textContent = msg;
    if (msg)
        input.setAttribute("aria-invalid", "true");
    else
        input.removeAttribute("aria-invalid");
}
function setUsernameStatus(msg, tone = "") {
    if (!usernameStatus)
        return;
    usernameStatus.textContent = msg;
    usernameStatus.className = tone ? `status-note ${tone}` : "status-note";
    if (tone === "bad")
        signupUsername === null || signupUsername === void 0 ? void 0 : signupUsername.setAttribute("aria-invalid", "true");
    else
        signupUsername === null || signupUsername === void 0 ? void 0 : signupUsername.removeAttribute("aria-invalid");
}
function passwordChecks(pw) {
    return {
        length: pw.length >= 8,
        upper: /[A-Z]/.test(pw),
        lower: /[a-z]/.test(pw),
        number: /[0-9]/.test(pw),
        symbol: /[^A-Za-z0-9]/.test(pw)
    };
}
function renderPasswordRules() {
    const checks = passwordChecks(String((signupPassword === null || signupPassword === void 0 ? void 0 : signupPassword.value) || ""));
    document.querySelectorAll("#passwordHint [data-rule]").forEach((li) => {
        li.classList.toggle("met", !!checks[li.dataset.rule || ""]);
    });
}
function validateField(input) {
    if (!input)
        return true;
    const value = input.value.trim();
    let msg = "";
    switch (input) {
        case signupFirstName:
            if (!value)
                msg = "Enter your first name.";
            break;
        case signupLastName:
            if (!value)
                msg = "Enter your last name.";
            break;
        case signupEmail:
            if (!value)
                msg = "Enter your email address.";
            else if (!EMAIL_RE.test(value))
                msg = "Enter a valid email address, like you@example.com.";
            break;
        case signupPassword: {
            const checks = passwordChecks(input.value);
            const missing = [
                !checks.length && "8 or more characters",
                !checks.upper && "an uppercase letter",
                !checks.lower && "a lowercase letter",
                !checks.number && "a number",
                !checks.symbol && "a symbol"
            ].filter(Boolean);
            if (!input.value)
                msg = "Choose a password.";
            else if (missing.length)
                msg = `Add ${missing.join(", ")}.`;
            break;
        }
        case signupPassword2:
            if (!input.value)
                msg = "Type your password again.";
            else if (input.value !== String((signupPassword === null || signupPassword === void 0 ? void 0 : signupPassword.value) || ""))
                msg = "Passwords don't match.";
            break;
    }
    fieldError(input, msg);
    return !msg;
}
// Username fields check Firestore as you type (after a short pause) and say whether the name
// is free. Signup uses #usernameStatus; the profile form uses the username hint.
const USERNAME_DEBOUNCE_MS = 350;
function usernameChecker(input, show) {
    let seq = 0;
    let timer = 0;
    async function check() {
        var _a, _b;
        window.clearTimeout(timer);
        if (!input || input.readOnly)
            return true;
        const username = input.value.trim().toLowerCase();
        if (input.value !== username)
            input.value = username;
        const mine = ++seq;
        if (!username) {
            show("Choose a username.", "bad");
            return false;
        }
        if (!USERNAME_RE.test(username)) {
            show("Use 3 to 20 lowercase letters or numbers, no spaces or symbols.", "bad");
            return false;
        }
        show("Checking…");
        try {
            const ok = await ((_b = (_a = requireAccount()).isUsernameAvailable) === null || _b === void 0 ? void 0 : _b.call(_a, username));
            if (mine === seq)
                show(ok ? "Yes, available" : `"${username}" is taken. Try another one.`, ok ? "good" : "bad");
            return !!ok;
        }
        catch (err) {
            if (mine === seq)
                show(`Couldn't check this username (${(err === null || err === void 0 ? void 0 : err.code) || "network error"}). It's checked again when you save.`);
            return true;
        }
    }
    input === null || input === void 0 ? void 0 : input.addEventListener("input", () => {
        window.clearTimeout(timer);
        seq++;
        if (!input.value.trim()) {
            show("");
            return;
        }
        timer = window.setTimeout(() => void check(), USERNAME_DEBOUNCE_MS);
    });
    return check;
}
const checkUsername = usernameChecker(signupUsername, setUsernameStatus);
const checkProfileUsername = usernameChecker(usernameLockedInput, (msg, tone = "") => {
    if (!usernameLockedHint)
        return;
    usernameLockedHint.textContent = msg || "Pick a username: 3 to 20 lowercase letters or numbers. It can't be changed later.";
    usernameLockedHint.classList.toggle("good", tone === "good");
    usernameLockedHint.classList.toggle("bad", tone === "bad");
});
const signupFields = [signupFirstName, signupLastName, signupEmail, signupPassword, signupPassword2];
signupFields.forEach((input) => {
    input === null || input === void 0 ? void 0 : input.addEventListener("blur", () => { if (input.value)
        validateField(input); });
    input === null || input === void 0 ? void 0 : input.addEventListener("input", () => {
        if (input.getAttribute("aria-invalid") === "true")
            validateField(input);
    });
});
signupPassword === null || signupPassword === void 0 ? void 0 : signupPassword.addEventListener("input", () => {
    renderPasswordRules();
    if (signupPassword2 === null || signupPassword2 === void 0 ? void 0 : signupPassword2.value)
        validateField(signupPassword2);
});
signupUsername === null || signupUsername === void 0 ? void 0 : signupUsername.addEventListener("blur", () => { if (signupUsername.value.trim())
    void checkUsername(); });
/* ---------- Wiring ---------- */
const account0 = window.atomAccount;
if (account0 === null || account0 === void 0 ? void 0 : account0.onAuthChange) {
    renderChecking();
    account0.onAuthChange((user) => {
        handleAuthChange(user).catch((err) => setAccountError(friendlyAuthError(err)));
    });
}
else {
    renderSignedOut();
    if (statusSub)
        statusSub.textContent = "Accounts are unavailable right now because the sign-in service didn't load. Check your connection and reload.";
}
guestNameForm === null || guestNameForm === void 0 ? void 0 : guestNameForm.addEventListener("submit", (event) => {
    var _a, _b;
    event.preventDefault();
    let saved = "";
    try {
        saved = String(((_b = (_a = requireAccount()).setLocalName) === null || _b === void 0 ? void 0 : _b.call(_a, (guestNameInput === null || guestNameInput === void 0 ? void 0 : guestNameInput.value) || "")) || "");
    }
    catch { }
    if (guestNameInput)
        guestNameInput.value = saved;
    if (profilePlayerName)
        profilePlayerName.textContent = saved || "Guest";
    setAvatar("", saved);
    if (guestNameHint)
        guestNameHint.textContent = saved ? "Saved. Buzzer rooms will fill this in for you." : "Name cleared.";
});
openSignInBtn === null || openSignInBtn === void 0 ? void 0 : openSignInBtn.addEventListener("click", () => openAuthModal("signin"));
openSignUpBtn === null || openSignUpBtn === void 0 ? void 0 : openSignUpBtn.addEventListener("click", () => openAuthModal("signup"));
showSignInTab === null || showSignInTab === void 0 ? void 0 : showSignInTab.addEventListener("click", () => switchAuthPanel("signin"));
showSignUpTab === null || showSignUpTab === void 0 ? void 0 : showSignUpTab.addEventListener("click", () => switchAuthPanel("signup"));
gotoSignupLink === null || gotoSignupLink === void 0 ? void 0 : gotoSignupLink.addEventListener("click", (e) => { e.preventDefault(); switchAuthPanel("signup"); signupFirstName === null || signupFirstName === void 0 ? void 0 : signupFirstName.focus(); });
gotoSigninLink === null || gotoSigninLink === void 0 ? void 0 : gotoSigninLink.addEventListener("click", (e) => { e.preventDefault(); switchAuthPanel("signin"); signinIdentifierInput === null || signinIdentifierInput === void 0 ? void 0 : signinIdentifierInput.focus(); });
closeAuthModalBtn === null || closeAuthModalBtn === void 0 ? void 0 : closeAuthModalBtn.addEventListener("click", closeAuthModal);
authModal === null || authModal === void 0 ? void 0 : authModal.addEventListener("click", (e) => { if (e.target === authModal)
    closeAuthModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape")
    closeAuthModal(); });
// Resolve once the store has loaded the signed-in user's profile (or after a timeout).
function waitForAccountLoaded(timeoutMs = 6000) {
    return new Promise((resolve) => {
        var _a;
        let account;
        try {
            account = requireAccount();
        }
        catch {
            resolve();
            return;
        }
        let unsubscribe = null;
        let done = false;
        const finish = () => {
            if (done)
                return;
            done = true;
            window.clearTimeout(timer);
            queueMicrotask(() => unsubscribe === null || unsubscribe === void 0 ? void 0 : unsubscribe());
            resolve();
        };
        const timer = window.setTimeout(finish, timeoutMs);
        unsubscribe = ((_a = account.onAuthChange) === null || _a === void 0 ? void 0 : _a.call(account, () => {
            var _a, _b, _c;
            if (((_a = account.getUser) === null || _a === void 0 ? void 0 : _a.call(account)) && (((_b = account.getProfile) === null || _b === void 0 ? void 0 : _b.call(account)) || ((_c = account.getSyncError) === null || _c === void 0 ? void 0 : _c.call(account))))
                finish();
        })) || null;
        if (done)
            unsubscribe === null || unsubscribe === void 0 ? void 0 : unsubscribe();
    });
}
function welcomeName() {
    var _a, _b;
    try {
        const account = requireAccount();
        const p = ((_a = account.getProfile) === null || _a === void 0 ? void 0 : _a.call(account)) || {};
        const u = ((_b = account.getUser) === null || _b === void 0 ? void 0 : _b.call(account)) || {};
        return String(p.playerName || p.username || u.displayName || u.email || "your account");
    }
    catch {
        return "your account";
    }
}
googleBtn === null || googleBtn === void 0 ? void 0 : googleBtn.addEventListener("click", async () => {
    setAuthError("");
    try {
        await withBusy(googleBtn, "Waiting for Google…", async () => {
            await requireAccount().signInWithProvider("google");
            await waitForAccountLoaded();
        });
        closeAuthModal();
        showToast(`Signed in as ${welcomeName()}`);
    }
    catch (err) {
        setAuthError(friendlyAuthError(err));
    }
});
resetPasswordBtn === null || resetPasswordBtn === void 0 ? void 0 : resetPasswordBtn.addEventListener("click", async () => {
    const email = String((signinIdentifierInput === null || signinIdentifierInput === void 0 ? void 0 : signinIdentifierInput.value) || "").trim();
    if (!email) {
        setAuthError("Enter your email above, then choose \"Forgot password?\" again.");
        signinIdentifierInput === null || signinIdentifierInput === void 0 ? void 0 : signinIdentifierInput.focus();
        return;
    }
    try {
        await withBusy(resetPasswordBtn, "Sending…", () => requireAccount().resetPassword(email));
        setAuthStatus(`If an account exists for ${email}, a reset link is on its way. Check your inbox.`);
    }
    catch (err) {
        setAuthError(friendlyAuthError(err));
    }
});
signInFormPanel === null || signInFormPanel === void 0 ? void 0 : signInFormPanel.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (signinBtn === null || signinBtn === void 0 ? void 0 : signinBtn.disabled)
        return;
    setAuthError("");
    const identifier = String((signinIdentifierInput === null || signinIdentifierInput === void 0 ? void 0 : signinIdentifierInput.value) || "").trim();
    const password = String((signinPasswordInput === null || signinPasswordInput === void 0 ? void 0 : signinPasswordInput.value) || "");
    if (!identifier) {
        setAuthError("Enter your email address.");
        signinIdentifierInput === null || signinIdentifierInput === void 0 ? void 0 : signinIdentifierInput.focus();
        return;
    }
    if (!EMAIL_RE.test(identifier)) {
        setAuthError("Enter the email address you signed up with, like you@example.com.");
        signinIdentifierInput === null || signinIdentifierInput === void 0 ? void 0 : signinIdentifierInput.focus();
        return;
    }
    if (!password) {
        setAuthError("Enter your password.");
        signinPasswordInput === null || signinPasswordInput === void 0 ? void 0 : signinPasswordInput.focus();
        return;
    }
    try {
        await withBusy(signinBtn, "Signing in…", async () => {
            const account = requireAccount();
            if (account.signInWithIdentifier)
                await account.signInWithIdentifier(identifier, password);
            else
                await account.signInWithEmail(identifier, password);
            await waitForAccountLoaded();
        });
        if (signinPasswordInput)
            signinPasswordInput.value = "";
        closeAuthModal();
        showToast(`Signed in as ${welcomeName()}`);
    }
    catch (err) {
        setAuthError(friendlyAuthError(err));
        signinPasswordInput === null || signinPasswordInput === void 0 ? void 0 : signinPasswordInput.select();
    }
});
signUpFormPanel === null || signUpFormPanel === void 0 ? void 0 : signUpFormPanel.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (signupBtn === null || signupBtn === void 0 ? void 0 : signupBtn.disabled)
        return;
    setAuthError("");
    const fieldsOk = signupFields.map((input) => validateField(input)).every(Boolean);
    const usernameOk = await checkUsername();
    if (!fieldsOk || !usernameOk) {
        setAuthError("Fix the highlighted fields to create your account.");
        const firstBad = signUpFormPanel.querySelector('[aria-invalid="true"]');
        firstBad === null || firstBad === void 0 ? void 0 : firstBad.focus();
        return;
    }
    const firstName = String((signupFirstName === null || signupFirstName === void 0 ? void 0 : signupFirstName.value) || "").trim();
    const lastName = String((signupLastName === null || signupLastName === void 0 ? void 0 : signupLastName.value) || "").trim();
    const email = String((signupEmail === null || signupEmail === void 0 ? void 0 : signupEmail.value) || "").trim();
    const phone = String((signupPhone === null || signupPhone === void 0 ? void 0 : signupPhone.value) || "").trim();
    const username = String((signupUsername === null || signupUsername === void 0 ? void 0 : signupUsername.value) || "").trim().toLowerCase();
    const playerName = String((signupPlayerName === null || signupPlayerName === void 0 ? void 0 : signupPlayerName.value) || "").trim() || `${firstName} ${lastName}`.trim();
    const password = String((signupPassword === null || signupPassword === void 0 ? void 0 : signupPassword.value) || "");
    try {
        await withBusy(signupBtn, "Creating account…", async () => {
            const account = requireAccount();
            if (account.signUpWithDetails) {
                await account.signUpWithDetails({ firstName, lastName, email, phone, username, password, playerName });
            }
            else {
                await account.signUpWithEmail(email, password, playerName || username);
            }
        });
        if (signupPassword)
            signupPassword.value = "";
        if (signupPassword2)
            signupPassword2.value = "";
        renderPasswordRules();
        closeAuthModal();
        showToast(`Account created. Signed in as ${welcomeName()}`);
    }
    catch (err) {
        const code = (err === null || err === void 0 ? void 0 : err.code) || "";
        if (code === "atom/profile-partial") {
            // The login exists and is signed in; show the explanation on the page.
            closeAuthModal();
            setAccountError(err.message);
            return;
        }
        if (code === "atom/username-taken") {
            setUsernameStatus(`"${username}" is taken. Try another one.`, "bad");
            signupUsername === null || signupUsername === void 0 ? void 0 : signupUsername.focus();
        }
        else if (code === "auth/email-already-in-use" || code === "auth/invalid-email") {
            fieldError(signupEmail, friendlyAuthError(err));
            signupEmail === null || signupEmail === void 0 ? void 0 : signupEmail.focus();
        }
        else if (code === "auth/password-does-not-meet-requirements" || code === "auth/weak-password") {
            fieldError(signupPassword, friendlyAuthError(err));
            signupPassword === null || signupPassword === void 0 ? void 0 : signupPassword.focus();
        }
        setAuthError(friendlyAuthError(err));
    }
});
// Photos are cropped to a square and shrunk to a small JPEG here, so any camera photo fits in
// the profile document, then saved straight away.
const PHOTO_SIZE = 256;
const PHOTO_HINT = "A JPG, PNG, GIF or WebP. It's cropped to a square and saves right away.";
function setPhotoHint(text, tone = "") {
    if (!photoHint)
        return;
    photoHint.textContent = text || PHOTO_HINT;
    photoHint.classList.toggle("good", tone === "good");
    photoHint.classList.toggle("bad", tone === "bad");
}
async function shrinkPhoto(file) {
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        if (!side)
            throw new Error("empty image");
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = PHOTO_SIZE;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
        return canvas.toDataURL("image/jpeg", 0.85);
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
photoUploadInput === null || photoUploadInput === void 0 ? void 0 : photoUploadInput.addEventListener("change", async () => {
    var _a, _b, _c;
    setAccountError("");
    const file = (_a = photoUploadInput.files) === null || _a === void 0 ? void 0 : _a[0];
    if (!file)
        return;
    if (file.size > 20000000) {
        setPhotoHint("That file is over 20 MB. Choose a smaller picture.", "bad");
        photoUploadInput.value = "";
        return;
    }
    let photo = "";
    try {
        photo = await shrinkPhoto(file);
    }
    catch {
        setPhotoHint("Couldn't open that picture. Choose a JPG, PNG, GIF or WebP.", "bad");
        photoUploadInput.value = "";
        return;
    }
    setAvatar(photo, String((playerNameInput === null || playerNameInput === void 0 ? void 0 : playerNameInput.value) || ""));
    setPhotoHint("Saving your picture…");
    try {
        await ((_c = (_b = requireAccount()).updateAccountProfile) === null || _c === void 0 ? void 0 : _c.call(_b, { photoURL: photo }));
        pendingPhotoData = "";
        setPhotoHint("Picture saved.", "good");
        showToast("Picture saved");
    }
    catch (err) {
        // Keep it so Save profile can try again.
        pendingPhotoData = photo;
        setPhotoHint(`Picture not saved. ${friendlyAuthError(err)} Press Save profile to try again.`, "bad");
    }
    finally {
        photoUploadInput.value = "";
    }
});
signedInPanel === null || signedInPanel === void 0 ? void 0 : signedInPanel.addEventListener("submit", async (event) => {
    var _a, _b;
    event.preventDefault();
    if (saveProfileBtn === null || saveProfileBtn === void 0 ? void 0 : saveProfileBtn.disabled)
        return;
    setAccountError("");
    setAccountStatus("");
    const playerName = String((playerNameInput === null || playerNameInput === void 0 ? void 0 : playerNameInput.value) || "").trim();
    if (!playerName) {
        setAccountError("Enter a player name. It's the name other players see in buzzer rooms.");
        playerNameInput === null || playerNameInput === void 0 ? void 0 : playerNameInput.focus();
        return;
    }
    const typedUsername = usernameLockedInput && !usernameLockedInput.readOnly
        ? usernameLockedInput.value.trim().toLowerCase()
        : "";
    if (typedUsername && !USERNAME_RE.test(typedUsername)) {
        setAccountError("Usernames are 3 to 20 lowercase letters or numbers, with no spaces or symbols.");
        usernameLockedInput === null || usernameLockedInput === void 0 ? void 0 : usernameLockedInput.focus();
        return;
    }
    if (typedUsername && !(await checkProfileUsername())) {
        usernameLockedInput === null || usernameLockedInput === void 0 ? void 0 : usernameLockedInput.focus();
        return;
    }
    try {
        const next = await withBusy(saveProfileBtn, "Saving…", () => {
            var _a, _b;
            return (_b = (_a = requireAccount()).updateAccountProfile) === null || _b === void 0 ? void 0 : _b.call(_a, {
                username: typedUsername || (usernameLockedInput === null || usernameLockedInput === void 0 ? void 0 : usernameLockedInput.value) || undefined,
                playerName,
                firstName: String((firstNameInput === null || firstNameInput === void 0 ? void 0 : firstNameInput.value) || "").trim(),
                lastName: String((lastNameInput === null || lastNameInput === void 0 ? void 0 : lastNameInput.value) || "").trim(),
                phone: String((phoneInput === null || phoneInput === void 0 ? void 0 : phoneInput.value) || "").trim(),
                photoURL: pendingPhotoData || undefined
            });
        });
        pendingPhotoData = "";
        if (photoUploadInput)
            photoUploadInput.value = "";
        if (next) {
            const user = (_b = (_a = requireAccount()).getUser) === null || _b === void 0 ? void 0 : _b.call(_a);
            if (user)
                await renderSignedIn(user);
        }
        setAccountStatus("Profile saved.");
        showToast("Profile saved");
    }
    catch (err) {
        setAccountError(`Profile not saved. ${friendlyAuthError(err)}`);
    }
});
verifyResendBtn === null || verifyResendBtn === void 0 ? void 0 : verifyResendBtn.addEventListener("click", async () => {
    try {
        await withBusy(verifyResendBtn, "Sending…", () => requireAccount().sendVerification());
        if (verifyNoticeText)
            verifyNoticeText.textContent = "New link sent. Check your inbox and spam folder.";
    }
    catch (err) {
        if (verifyNoticeText)
            verifyNoticeText.textContent = (err === null || err === void 0 ? void 0 : err.code) === "auth/too-many-requests"
                ? "We just sent one. Wait a minute before asking for another."
                : `Couldn't send the link (${friendlyAuthError(err)}).`;
    }
});
verifyCheckBtn === null || verifyCheckBtn === void 0 ? void 0 : verifyCheckBtn.addEventListener("click", () => withBusy(verifyCheckBtn, "Checking…", () => checkVerification()));
// Coming back from the email link, or back to this tab after clicking it elsewhere.
(_b = window.addEventListener) === null || _b === void 0 ? void 0 : _b.call(window, "focus", () => {
    if (verifyNotice && !verifyNotice.classList.contains("hidden"))
        void checkVerification({ quiet: true });
});
signOutBtn === null || signOutBtn === void 0 ? void 0 : signOutBtn.addEventListener("click", async () => {
    setAccountError("");
    try {
        await withBusy(signOutBtn, "Signing out…", () => requireAccount().signOut());
        showToast("Signed out");
    }
    catch (err) {
        setAccountError(`Sign-out failed. ${friendlyAuthError(err)}`);
    }
});
retrySyncBtn === null || retrySyncBtn === void 0 ? void 0 : retrySyncBtn.addEventListener("click", async () => {
    var _a;
    try {
        const account = requireAccount();
        (_a = account.clearLastWriteError) === null || _a === void 0 ? void 0 : _a.call(account);
        await withBusy(retrySyncBtn, "Trying again…", () => { var _a; return ((_a = account.retrySync) === null || _a === void 0 ? void 0 : _a.call(account)) || Promise.resolve(); });
        renderSyncNotice();
        if (!syncNotice || syncNotice.classList.contains("hidden"))
            showToast("Account synced");
    }
    catch (err) {
        if (syncNoticeText)
            syncNoticeText.textContent = `Still failing: ${friendlyAuthError(err)}`;
    }
});
//# sourceMappingURL=account.js.map