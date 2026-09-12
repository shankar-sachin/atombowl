var _a, _b;
import "./account_store.js";
const statusText = document.getElementById("statusText");
const statusSub = document.getElementById("statusSub");
const guestTagEl = document.getElementById("guestTag");
const profileUsername = document.getElementById("profileUsername");
const profilePlayerName = document.getElementById("profilePlayerName");
const profileEmail = document.getElementById("profileEmail");
const profilePhoto = document.getElementById("profilePhoto");
const signedOutActions = document.getElementById("signedOutActions");
const signedInPanel = document.getElementById("signedInPanel");
const signOutBtn = document.getElementById("signOutBtn");
const playerNameInput = document.getElementById("playerNameInput");
const firstNameInput = document.getElementById("firstNameInput");
const lastNameInput = document.getElementById("lastNameInput");
const phoneInput = document.getElementById("phoneInput");
const usernameLockedInput = document.getElementById("usernameLockedInput");
const emailLockedInput = document.getElementById("emailLockedInput");
const photoUploadInput = document.getElementById("photoUploadInput");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const accountErrorEl = document.getElementById("accountError");
const statRuns = document.getElementById("statRuns");
const statAvgScore = document.getElementById("statAvgScore");
const statTimePlayed = document.getElementById("statTimePlayed");
const statAccuracy = document.getElementById("statAccuracy");
const authModal = document.getElementById("authModal");
const closeAuthModalBtn = document.getElementById("closeAuthModal");
const openSignInBtn = document.getElementById("openSignInBtn");
const openSignUpBtn = document.getElementById("openSignUpBtn");
const showSignInTab = document.getElementById("showSignInTab");
const showSignUpTab = document.getElementById("showSignUpTab");
const signInFormPanel = document.getElementById("signInFormPanel");
const signUpFormPanel = document.getElementById("signUpFormPanel");
const authModalTitle = authModal === null || authModal === void 0 ? void 0 : authModal.querySelector(".modal-header h2");
const gotoSignupLink = document.getElementById("gotoSignupLink");
const gotoSigninLink = document.getElementById("gotoSigninLink");
const authError = document.getElementById("authError");
const usernameStatus = document.getElementById("usernameStatus");
const googleBtn = document.getElementById("googleBtn");
const microsoftBtn = document.getElementById("microsoftBtn");
const appleBtn = document.getElementById("appleBtn");
const signinIdentifierInput = document.getElementById("signinIdentifierInput");
const signinPasswordInput = document.getElementById("signinPasswordInput");
const signinBtn = document.getElementById("signinBtn");
const signupFirstName = document.getElementById("signupFirstName");
const signupLastName = document.getElementById("signupLastName");
const signupEmail = document.getElementById("signupEmail");
const signupPhone = document.getElementById("signupPhone");
const signupUsername = document.getElementById("signupUsername");
const signupPlayerName = document.getElementById("signupPlayerName");
const signupPassword = document.getElementById("signupPassword");
const signupPassword2 = document.getElementById("signupPassword2");
const signupBtn = document.getElementById("signupBtn");
let pendingPhotoData = "";
function refreshAccountCopy() {
    const signinPasswordLabel = document.querySelector('label[for="signinPasswordInput"]');
    if (signinPasswordLabel)
        signinPasswordLabel.textContent = "Password";
    const signinPanelLabels = Array.from(document.querySelectorAll("#signInFormPanel .label"));
    signinPanelLabels.forEach((label) => {
        var _a;
        if (((_a = label.textContent) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase()) === "p-word") {
            label.textContent = "Password";
        }
    });
}
function requireAccount() {
    const account = window.atomAccount;
    if (!account)
        throw new Error("Account module failed to load.");
    return account;
}
function setAuthError(msg = "") {
    if (authError)
        authError.textContent = msg;
}
function setAccountError(msg = "") {
    if (accountErrorEl)
        accountErrorEl.textContent = msg;
}
function setBusy(isBusy) {
    document.querySelectorAll("[data-auth-action]").forEach((el) => {
        el.disabled = isBusy;
    });
}
function friendlyAuthError(err) {
    const code = (err === null || err === void 0 ? void 0 : err.code) || "";
    switch (code) {
        case "auth/user-not-found":
        case "auth/invalid-credential":
            return "Invalid email or password.";
        case "auth/wrong-password":
            return "Incorrect password.";
        case "auth/email-already-in-use":
            return "An account with this email already exists. Try signing in.";
        case "auth/weak-password":
        case "auth/password-does-not-meet-requirements":
            return "Use at least 8 characters with uppercase and lowercase letters, a number, and a symbol.";
        case "auth/invalid-email":
            return "Please enter a valid email address.";
        case "auth/too-many-requests":
            return "Too many attempts. Please try again later.";
        case "auth/network-request-failed":
            return "Network error. Check your connection.";
        case "auth/popup-blocked":
            return "Allow popups for this site and try again.";
        case "auth/operation-not-allowed":
            return "This sign-in provider is not enabled in Firebase. Try another sign-in method.";
        case "auth/unauthorized-domain":
            return "This website domain must be added to Firebase Authentication authorized domains.";
        case "auth/account-exists-with-different-credential":
            return "Use the sign-in method you originally used for this email.";
        case "auth/popup-closed-by-user":
            return "Sign-in popup was closed.";
        default:
            return (err === null || err === void 0 ? void 0 : err.message) || "Authentication failed.";
    }
}
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
    const existing = (localStorage.getItem(key) || "").trim();
    if (/^[A-Za-z0-9]{12}$/.test(existing))
        return existing;
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let tag = "";
    for (let i = 0; i < 12; i += 1)
        tag += chars[Math.floor(Math.random() * chars.length)];
    localStorage.setItem(key, tag);
    return tag;
}
function switchAuthPanel(mode) {
    if (!signInFormPanel || !signUpFormPanel || !showSignInTab || !showSignUpTab)
        return;
    const isSignIn = mode === "signin";
    signInFormPanel.classList.toggle("hidden", !isSignIn);
    signUpFormPanel.classList.toggle("hidden", isSignIn);
    showSignInTab.classList.toggle("active", isSignIn);
    showSignUpTab.classList.toggle("active", !isSignIn);
    if (authModalTitle)
        authModalTitle.textContent = isSignIn ? "Sign In" : "Create Account";
}
function openAuthModal(mode) {
    if (!authModal)
        return;
    switchAuthPanel(mode);
    authModal.classList.remove("hidden");
    authModal.classList.remove("modal-enter");
    void authModal.offsetWidth;
    authModal.classList.add("modal-enter");
    setAuthError("");
}
function closeAuthModal() {
    if (!authModal)
        return;
    authModal.classList.remove("modal-enter");
    authModal.classList.add("hidden");
}
async function renderStats() {
    var _a;
    const account = requireAccount();
    const user = account.getUser();
    const stats = await ((_a = account.loadPracticeStats) === null || _a === void 0 ? void 0 : _a.call(account));
    if (account.getUser() !== user)
        return;
    const runs = Number((stats === null || stats === void 0 ? void 0 : stats.totalRuns) || 0);
    const answered = Number((stats === null || stats === void 0 ? void 0 : stats.totalAnswered) || 0);
    const correct = Number((stats === null || stats === void 0 ? void 0 : stats.totalCorrect) || 0);
    const totalTime = Number((stats === null || stats === void 0 ? void 0 : stats.totalTime) || 0);
    const avgScore = runs > 0 ? (correct / runs).toFixed(1) : "0.0";
    const accuracy = answered > 0 ? `${Math.round((correct / answered) * 100)}%` : "0%";
    if (statRuns)
        statRuns.textContent = String(runs);
    if (statAvgScore)
        statAvgScore.textContent = avgScore;
    if (statTimePlayed)
        statTimePlayed.textContent = toReadableTime(totalTime);
    if (statAccuracy)
        statAccuracy.textContent = accuracy;
}
async function renderSignedOut() {
    var _a;
    const account = requireAccount();
    if (statusText) {
        statusText.textContent = "Not Signed In";
        statusText.classList.remove("signed-in");
    }
    if (statusSub)
        statusSub.textContent = "Sign in to sync your profile and stats.";
    if (profileUsername)
        profileUsername.textContent = "Sign In";
    if (profilePlayerName)
        profilePlayerName.textContent = "Guest";
    if (profileEmail)
        profileEmail.textContent = "No account connected";
    if (profilePhoto)
        profilePhoto.src = "favicon.png";
    if (usernameLockedInput)
        usernameLockedInput.value = "";
    if (emailLockedInput)
        emailLockedInput.value = "";
    if (guestTagEl)
        guestTagEl.textContent = ((_a = account.getGuestTag) === null || _a === void 0 ? void 0 : _a.call(account)) || fallbackGuestTag();
    if (signedOutActions)
        signedOutActions.classList.remove("hidden");
    if (signedInPanel)
        signedInPanel.classList.add("hidden");
    if (statRuns)
        statRuns.textContent = "0";
    if (statAvgScore)
        statAvgScore.textContent = "0.0";
    if (statTimePlayed)
        statTimePlayed.textContent = "0m";
    if (statAccuracy)
        statAccuracy.textContent = "0%";
}
async function renderSignedIn(user) {
    var _a, _b;
    const account = requireAccount();
    const profile = ((_a = account.getProfile) === null || _a === void 0 ? void 0 : _a.call(account)) || {};
    const username = String((profile === null || profile === void 0 ? void 0 : profile.username) || "").trim() || String((user === null || user === void 0 ? void 0 : user.email) || "").split("@")[0] || "player";
    const playerName = String((profile === null || profile === void 0 ? void 0 : profile.playerName) || (profile === null || profile === void 0 ? void 0 : profile.displayName) || (user === null || user === void 0 ? void 0 : user.displayName) || username);
    const firstName = String((profile === null || profile === void 0 ? void 0 : profile.firstName) || "");
    const lastName = String((profile === null || profile === void 0 ? void 0 : profile.lastName) || "");
    const phone = String((profile === null || profile === void 0 ? void 0 : profile.phone) || "");
    const email = String((profile === null || profile === void 0 ? void 0 : profile.email) || (user === null || user === void 0 ? void 0 : user.email) || "");
    const photo = String((profile === null || profile === void 0 ? void 0 : profile.photoURL) || (user === null || user === void 0 ? void 0 : user.photoURL) || "favicon.png");
    if (statusText) {
        statusText.textContent = "Signed In";
        statusText.classList.add("signed-in");
    }
    if (statusSub)
        statusSub.textContent = "Your account is connected.";
    if (guestTagEl)
        guestTagEl.textContent = ((_b = account.getGuestTag) === null || _b === void 0 ? void 0 : _b.call(account)) || fallbackGuestTag();
    if (profileUsername)
        profileUsername.textContent = username;
    if (profilePlayerName)
        profilePlayerName.textContent = playerName;
    if (profileEmail)
        profileEmail.textContent = email || "Linked account";
    if (profilePhoto)
        profilePhoto.src = photo;
    if (signedOutActions)
        signedOutActions.classList.add("hidden");
    if (signedInPanel)
        signedInPanel.classList.remove("hidden");
    if (playerNameInput)
        playerNameInput.value = playerName;
    if (firstNameInput)
        firstNameInput.value = firstName;
    if (lastNameInput)
        lastNameInput.value = lastName;
    if (phoneInput)
        phoneInput.value = phone;
    if (usernameLockedInput) {
        usernameLockedInput.value = profile.username || "";
        usernameLockedInput.readOnly = !!profile.username;
        usernameLockedInput.classList.toggle("input-readonly", !!profile.username);
        usernameLockedInput.disabled = !!profile.username;
        usernameLockedInput.placeholder = "Choose a username";
    }
    if (emailLockedInput)
        emailLockedInput.value = email;
    pendingPhotoData = "";
    await renderStats();
}
async function handleAuthChange(user) {
    var _a, _b;
    setAccountError("");
    if (!user || user.isAnonymous) {
        await renderSignedOut();
        return;
    }
    await renderSignedIn(user);
    setAccountError(((_b = (_a = requireAccount()).getSyncError) === null || _b === void 0 ? void 0 : _b.call(_a)) || "");
}
if ((_a = window.atomAccount) === null || _a === void 0 ? void 0 : _a.onAuthChange) {
    window.atomAccount.onAuthChange((user) => {
        handleAuthChange(user).catch((err) => setAccountError((err === null || err === void 0 ? void 0 : err.message) || "Failed to load account."));
    });
}
else {
    renderSignedOut().catch(() => { });
}
refreshAccountCopy();
openSignInBtn === null || openSignInBtn === void 0 ? void 0 : openSignInBtn.addEventListener("click", () => openAuthModal("signin"));
openSignUpBtn === null || openSignUpBtn === void 0 ? void 0 : openSignUpBtn.addEventListener("click", () => openAuthModal("signup"));
showSignInTab === null || showSignInTab === void 0 ? void 0 : showSignInTab.addEventListener("click", () => switchAuthPanel("signin"));
showSignUpTab === null || showSignUpTab === void 0 ? void 0 : showSignUpTab.addEventListener("click", () => switchAuthPanel("signup"));
gotoSignupLink === null || gotoSignupLink === void 0 ? void 0 : gotoSignupLink.addEventListener("click", (e) => {
    e.preventDefault();
    switchAuthPanel("signup");
});
gotoSigninLink === null || gotoSigninLink === void 0 ? void 0 : gotoSigninLink.addEventListener("click", (e) => {
    e.preventDefault();
    switchAuthPanel("signin");
});
closeAuthModalBtn === null || closeAuthModalBtn === void 0 ? void 0 : closeAuthModalBtn.addEventListener("click", closeAuthModal);
authModal === null || authModal === void 0 ? void 0 : authModal.addEventListener("click", (e) => {
    if (e.target === authModal)
        closeAuthModal();
});
async function signInWithSocialProvider(provider) {
    setAuthError("");
    try {
        setBusy(true);
        await requireAccount().signInWithProvider(provider);
        closeAuthModal();
    }
    catch (err) {
        setAuthError(friendlyAuthError(err));
    }
    finally {
        setBusy(false);
    }
}
googleBtn === null || googleBtn === void 0 ? void 0 : googleBtn.addEventListener("click", () => signInWithSocialProvider("google"));
microsoftBtn === null || microsoftBtn === void 0 ? void 0 : microsoftBtn.addEventListener("click", () => setAuthError("Coming soon"));
appleBtn === null || appleBtn === void 0 ? void 0 : appleBtn.addEventListener("click", () => setAuthError("Coming soon"));
(_b = document.getElementById("resetPasswordBtn")) === null || _b === void 0 ? void 0 : _b.addEventListener("click", async () => {
    setBusy(true);
    try {
        await requireAccount().resetPassword(String((signinIdentifierInput === null || signinIdentifierInput === void 0 ? void 0 : signinIdentifierInput.value) || ""));
        setAuthError("If an account exists for that email, a password reset link has been sent.");
    }
    catch (err) {
        setAuthError(friendlyAuthError(err));
    }
    finally {
        setBusy(false);
    }
});
signinPasswordInput === null || signinPasswordInput === void 0 ? void 0 : signinPasswordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !(signinBtn === null || signinBtn === void 0 ? void 0 : signinBtn.disabled))
        signinBtn === null || signinBtn === void 0 ? void 0 : signinBtn.click();
});
signupPassword2 === null || signupPassword2 === void 0 ? void 0 : signupPassword2.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !(signupBtn === null || signupBtn === void 0 ? void 0 : signupBtn.disabled))
        signupBtn === null || signupBtn === void 0 ? void 0 : signupBtn.click();
});
signinBtn === null || signinBtn === void 0 ? void 0 : signinBtn.addEventListener("click", async () => {
    setAuthError("");
    const identifier = String((signinIdentifierInput === null || signinIdentifierInput === void 0 ? void 0 : signinIdentifierInput.value) || "").trim();
    const password = String((signinPasswordInput === null || signinPasswordInput === void 0 ? void 0 : signinPasswordInput.value) || "");
    if (!identifier || !password) {
        setAuthError("Email and password are required.");
        return;
    }
    try {
        setBusy(true);
        const account = requireAccount();
        if (account.signInWithIdentifier) {
            await account.signInWithIdentifier(identifier, password);
        }
        else {
            await account.signInWithEmail(identifier, password);
        }
        closeAuthModal();
        if (signinPasswordInput)
            signinPasswordInput.value = "";
    }
    catch (err) {
        setAuthError(friendlyAuthError(err));
    }
    finally {
        setBusy(false);
    }
});
signupUsername === null || signupUsername === void 0 ? void 0 : signupUsername.addEventListener("blur", async () => {
    var _a, _b;
    if (!signupUsername || !usernameStatus)
        return;
    const username = signupUsername.value.trim().toLowerCase();
    if (!username) {
        usernameStatus.textContent = "";
        usernameStatus.className = "status-note";
        return;
    }
    if (!/^[a-z0-9]{3,20}$/.test(username)) {
        usernameStatus.textContent = "Use 3-20 lowercase letters/numbers.";
        usernameStatus.className = "status-note bad";
        return;
    }
    usernameStatus.textContent = "Checking...";
    usernameStatus.className = "status-note";
    try {
        const ok = await ((_b = (_a = requireAccount()).isUsernameAvailable) === null || _b === void 0 ? void 0 : _b.call(_a, username));
        usernameStatus.textContent = ok ? "Username is available!" : "Username is taken.";
        usernameStatus.className = ok ? "status-note good" : "status-note bad";
    }
    catch {
        usernameStatus.textContent = "Could not check username.";
        usernameStatus.className = "status-note bad";
    }
});
signupBtn === null || signupBtn === void 0 ? void 0 : signupBtn.addEventListener("click", async () => {
    setAuthError("");
    const firstName = String((signupFirstName === null || signupFirstName === void 0 ? void 0 : signupFirstName.value) || "").trim();
    const lastName = String((signupLastName === null || signupLastName === void 0 ? void 0 : signupLastName.value) || "").trim();
    const email = String((signupEmail === null || signupEmail === void 0 ? void 0 : signupEmail.value) || "").trim();
    const phone = String((signupPhone === null || signupPhone === void 0 ? void 0 : signupPhone.value) || "").trim();
    const username = String((signupUsername === null || signupUsername === void 0 ? void 0 : signupUsername.value) || "").trim().toLowerCase();
    const playerName = String((signupPlayerName === null || signupPlayerName === void 0 ? void 0 : signupPlayerName.value) || `${firstName} ${lastName}`).trim();
    const password = String((signupPassword === null || signupPassword === void 0 ? void 0 : signupPassword.value) || "");
    const password2 = String((signupPassword2 === null || signupPassword2 === void 0 ? void 0 : signupPassword2.value) || "");
    if (!firstName || !lastName || !email || !username || !password) {
        setAuthError("Please complete all required fields.");
        return;
    }
    if (!/^[a-z0-9]{3,20}$/.test(username)) {
        setAuthError("Username must be 3-20 lowercase letters/numbers.");
        return;
    }
    if (password !== password2) {
        setAuthError("Passwords do not match.");
        return;
    }
    try {
        setBusy(true);
        const account = requireAccount();
        if (account.signUpWithDetails) {
            await account.signUpWithDetails({
                firstName,
                lastName,
                email,
                phone,
                username,
                password,
                playerName
            });
        }
        else {
            await account.signUpWithEmail(email, password, playerName || username);
        }
        closeAuthModal();
        if (signupPassword)
            signupPassword.value = "";
        if (signupPassword2)
            signupPassword2.value = "";
    }
    catch (err) {
        setAuthError(friendlyAuthError(err));
    }
    finally {
        setBusy(false);
    }
});
photoUploadInput === null || photoUploadInput === void 0 ? void 0 : photoUploadInput.addEventListener("change", async () => {
    var _a;
    setAccountError("");
    const file = (_a = photoUploadInput.files) === null || _a === void 0 ? void 0 : _a[0];
    if (!file)
        return;
    if (!file.type.startsWith("image/")) {
        setAccountError("Please choose an image file.");
        return;
    }
    if (file.size > 250000) {
        setAccountError("Image is too large. Max 250 KB.");
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        pendingPhotoData = String(reader.result || "");
        if (profilePhoto && pendingPhotoData)
            profilePhoto.src = pendingPhotoData;
    };
    reader.readAsDataURL(file);
});
saveProfileBtn === null || saveProfileBtn === void 0 ? void 0 : saveProfileBtn.addEventListener("click", async () => {
    var _a;
    setAccountError("");
    try {
        setBusy(true);
        const account = requireAccount();
        const next = await ((_a = account.updateAccountProfile) === null || _a === void 0 ? void 0 : _a.call(account, {
            username: (usernameLockedInput === null || usernameLockedInput === void 0 ? void 0 : usernameLockedInput.value) || undefined,
            playerName: String((playerNameInput === null || playerNameInput === void 0 ? void 0 : playerNameInput.value) || "").trim(),
            firstName: String((firstNameInput === null || firstNameInput === void 0 ? void 0 : firstNameInput.value) || "").trim(),
            lastName: String((lastNameInput === null || lastNameInput === void 0 ? void 0 : lastNameInput.value) || "").trim(),
            phone: String((phoneInput === null || phoneInput === void 0 ? void 0 : phoneInput.value) || "").trim(),
            photoURL: pendingPhotoData || undefined
        }));
        pendingPhotoData = "";
        if (next) {
            if (next.username && usernameLockedInput) {
                usernameLockedInput.disabled = true;
                usernameLockedInput.readOnly = true;
                if (profileUsername)
                    profileUsername.textContent = next.username;
            }
            if (profilePlayerName)
                profilePlayerName.textContent = String(next.playerName || "");
            if (profilePhoto && next.photoURL) {
                profilePhoto.src = String(next.photoURL);
            }
        }
    }
    catch (err) {
        setAccountError((err === null || err === void 0 ? void 0 : err.message) || "Failed to save profile.");
    }
    finally {
        setBusy(false);
    }
});
signOutBtn === null || signOutBtn === void 0 ? void 0 : signOutBtn.addEventListener("click", async () => {
    setAccountError("");
    try {
        setBusy(true);
        await requireAccount().signOut();
    }
    catch (err) {
        setAccountError((err === null || err === void 0 ? void 0 : err.message) || "Sign-out failed.");
    }
    finally {
        setBusy(false);
    }
});
//# sourceMappingURL=account.js.map