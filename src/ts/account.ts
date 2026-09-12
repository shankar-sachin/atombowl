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

const playerNameInput = document.getElementById("playerNameInput") as HTMLInputElement | null;
const firstNameInput = document.getElementById("firstNameInput") as HTMLInputElement | null;
const lastNameInput = document.getElementById("lastNameInput") as HTMLInputElement | null;
const phoneInput = document.getElementById("phoneInput") as HTMLInputElement | null;
const usernameLockedInput = document.getElementById("usernameLockedInput") as HTMLInputElement | null;
const emailLockedInput = document.getElementById("emailLockedInput") as HTMLInputElement | null;
const photoUploadInput = document.getElementById("photoUploadInput") as HTMLInputElement | null;
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
const authModalTitle = authModal?.querySelector(".modal-header h2") as HTMLElement | null;
const gotoSignupLink = document.getElementById("gotoSignupLink");
const gotoSigninLink = document.getElementById("gotoSigninLink");
const authError = document.getElementById("authError");
const usernameStatus = document.getElementById("usernameStatus");

const googleBtn = document.getElementById("googleBtn");
const microsoftBtn = document.getElementById("microsoftBtn");
const appleBtn = document.getElementById("appleBtn");
const signinIdentifierInput = document.getElementById("signinIdentifierInput") as HTMLInputElement | null;
const signinPasswordInput = document.getElementById("signinPasswordInput") as HTMLInputElement | null;
const signinBtn = document.getElementById("signinBtn");

const signupFirstName = document.getElementById("signupFirstName") as HTMLInputElement | null;
const signupLastName = document.getElementById("signupLastName") as HTMLInputElement | null;
const signupEmail = document.getElementById("signupEmail") as HTMLInputElement | null;
const signupPhone = document.getElementById("signupPhone") as HTMLInputElement | null;
const signupUsername = document.getElementById("signupUsername") as HTMLInputElement | null;
const signupPlayerName = document.getElementById("signupPlayerName") as HTMLInputElement | null;
const signupPassword = document.getElementById("signupPassword") as HTMLInputElement | null;
const signupPassword2 = document.getElementById("signupPassword2") as HTMLInputElement | null;
const signupBtn = document.getElementById("signupBtn");

let pendingPhotoData = "";

function refreshAccountCopy() {
  const signinPasswordLabel = document.querySelector('label[for="signinPasswordInput"]');
  if (signinPasswordLabel) signinPasswordLabel.textContent = "Password";

  const signinPanelLabels = Array.from(document.querySelectorAll("#signInFormPanel .label"));
  signinPanelLabels.forEach((label) => {
    if (label.textContent?.trim().toLowerCase() === "p-word") {
      label.textContent = "Password";
    }
  });


}

function requireAccount() {
  const account = window.atomAccount;
  if (!account) throw new Error("Account module failed to load.");
  return account;
}

function setAuthError(msg = "") {
  if (authError) authError.textContent = msg;
}

function setAccountError(msg = "") {
  if (accountErrorEl) accountErrorEl.textContent = msg;
}

function setBusy(isBusy: boolean) {
  document.querySelectorAll("[data-auth-action]").forEach((el) => {
    (el as HTMLButtonElement).disabled = isBusy;
  });
}

function friendlyAuthError(err: any): string {
  const code = err?.code || "";
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
      return err?.message || "Authentication failed.";
  }
}

function toReadableTime(totalSeconds: number) {
  const s = Math.max(0, Math.round(Number(totalSeconds || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fallbackGuestTag() {
  const key = "atom_guest_tag_v1";
  const existing = (localStorage.getItem(key) || "").trim();
  if (/^[A-Za-z0-9]{12}$/.test(existing)) return existing;
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let tag = "";
  for (let i = 0; i < 12; i += 1) tag += chars[Math.floor(Math.random() * chars.length)];
  localStorage.setItem(key, tag);
  return tag;
}

function switchAuthPanel(mode: "signin" | "signup") {
  if (!signInFormPanel || !signUpFormPanel || !showSignInTab || !showSignUpTab) return;
  const isSignIn = mode === "signin";
  signInFormPanel.classList.toggle("hidden", !isSignIn);
  signUpFormPanel.classList.toggle("hidden", isSignIn);
  showSignInTab.classList.toggle("active", isSignIn);
  showSignUpTab.classList.toggle("active", !isSignIn);
  if (authModalTitle) authModalTitle.textContent = isSignIn ? "Sign In" : "Create Account";
}

function openAuthModal(mode: "signin" | "signup") {
  if (!authModal) return;
  switchAuthPanel(mode);
  authModal.classList.remove("hidden");
  authModal.classList.remove("modal-enter");
  void (authModal as HTMLElement).offsetWidth;
  authModal.classList.add("modal-enter");
  setAuthError("");
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.classList.remove("modal-enter");
  authModal.classList.add("hidden");
}

async function renderStats() {
  const account = requireAccount();
  const user = account.getUser();
  const stats = await account.loadPracticeStats?.();
  if (account.getUser() !== user) return;
  const runs = Number(stats?.totalRuns || 0);
  const answered = Number(stats?.totalAnswered || 0);
  const correct = Number(stats?.totalCorrect || 0);
  const totalTime = Number(stats?.totalTime || 0);

  const avgScore = runs > 0 ? (correct / runs).toFixed(1) : "0.0";
  const accuracy = answered > 0 ? `${Math.round((correct / answered) * 100)}%` : "0%";

  if (statRuns) statRuns.textContent = String(runs);
  if (statAvgScore) statAvgScore.textContent = avgScore;
  if (statTimePlayed) statTimePlayed.textContent = toReadableTime(totalTime);
  if (statAccuracy) statAccuracy.textContent = accuracy;
}

async function renderSignedOut() {
  const account = requireAccount();
  if (statusText) {
    statusText.textContent = "Not Signed In";
    statusText.classList.remove("signed-in");
  }
  if (statusSub) statusSub.textContent = "Sign in to sync your profile and stats.";
  if (profileUsername) profileUsername.textContent = "Sign In";
  if (profilePlayerName) profilePlayerName.textContent = "Guest";
  if (profileEmail) profileEmail.textContent = "No account connected";
  if (profilePhoto) (profilePhoto as HTMLImageElement).src = "favicon.png";
  if (usernameLockedInput) usernameLockedInput.value = "";
  if (emailLockedInput) emailLockedInput.value = "";
  if (guestTagEl) guestTagEl.textContent = account.getGuestTag?.() || fallbackGuestTag();
  if (signedOutActions) signedOutActions.classList.remove("hidden");
  if (signedInPanel) signedInPanel.classList.add("hidden");
  if (statRuns) statRuns.textContent = "0";
  if (statAvgScore) statAvgScore.textContent = "0.0";
  if (statTimePlayed) statTimePlayed.textContent = "0m";
  if (statAccuracy) statAccuracy.textContent = "0%";
}

async function renderSignedIn(user: any) {
  const account = requireAccount();
  const profile = account.getProfile?.() || {};
  const username = String(profile?.username || "").trim() || String(user?.email || "").split("@")[0] || "player";
  const playerName = String(profile?.playerName || profile?.displayName || user?.displayName || username);
  const firstName = String(profile?.firstName || "");
  const lastName = String(profile?.lastName || "");
  const phone = String(profile?.phone || "");
  const email = String(profile?.email || user?.email || "");
  const photo = String(profile?.photoURL || user?.photoURL || "favicon.png");

  if (statusText) {
    statusText.textContent = "Signed In";
    statusText.classList.add("signed-in");
  }
  if (statusSub) statusSub.textContent = "Your account is connected.";
  if (guestTagEl) guestTagEl.textContent = account.getGuestTag?.() || fallbackGuestTag();
  if (profileUsername) profileUsername.textContent = username;
  if (profilePlayerName) profilePlayerName.textContent = playerName;
  if (profileEmail) profileEmail.textContent = email || "Linked account";
  if (profilePhoto) (profilePhoto as HTMLImageElement).src = photo;
  if (signedOutActions) signedOutActions.classList.add("hidden");
  if (signedInPanel) signedInPanel.classList.remove("hidden");

  if (playerNameInput) playerNameInput.value = playerName;
  if (firstNameInput) firstNameInput.value = firstName;
  if (lastNameInput) lastNameInput.value = lastName;
  if (phoneInput) phoneInput.value = phone;
  if (usernameLockedInput) {
    usernameLockedInput.value = profile.username || "";
    usernameLockedInput.readOnly = !!profile.username;
    usernameLockedInput.classList.toggle("input-readonly", !!profile.username);
    usernameLockedInput.disabled = !!profile.username;
    usernameLockedInput.placeholder = "Choose a username";
  }
  if (emailLockedInput) emailLockedInput.value = email;

  pendingPhotoData = "";
  await renderStats();
}

async function handleAuthChange(user: any) {
  setAccountError("");
  if (!user || user.isAnonymous) {
    await renderSignedOut();
    return;
  }
  await renderSignedIn(user);
  setAccountError(requireAccount().getSyncError?.() || "");
}

if (window.atomAccount?.onAuthChange) {
  window.atomAccount.onAuthChange((user) => {
    handleAuthChange(user).catch((err: any) => setAccountError(err?.message || "Failed to load account."));
  });
} else {
  renderSignedOut().catch(() => {});
}

refreshAccountCopy();

openSignInBtn?.addEventListener("click", () => openAuthModal("signin"));
openSignUpBtn?.addEventListener("click", () => openAuthModal("signup"));
showSignInTab?.addEventListener("click", () => switchAuthPanel("signin"));
showSignUpTab?.addEventListener("click", () => switchAuthPanel("signup"));
gotoSignupLink?.addEventListener("click", (e) => {
  e.preventDefault();
  switchAuthPanel("signup");
});
gotoSigninLink?.addEventListener("click", (e) => {
  e.preventDefault();
  switchAuthPanel("signin");
});
closeAuthModalBtn?.addEventListener("click", closeAuthModal);
authModal?.addEventListener("click", (e) => {
  if (e.target === authModal) closeAuthModal();
});

async function signInWithSocialProvider(provider: "google") {
  setAuthError("");
  try {
    setBusy(true);
    await requireAccount().signInWithProvider(provider);
    closeAuthModal();
  } catch (err: any) {
    setAuthError(friendlyAuthError(err));
  } finally {
    setBusy(false);
  }
}

googleBtn?.addEventListener("click", () => signInWithSocialProvider("google"));
microsoftBtn?.addEventListener("click", () => setAuthError("Coming soon"));
appleBtn?.addEventListener("click", () => setAuthError("Coming soon"));

document.getElementById("resetPasswordBtn")?.addEventListener("click", async () => {
  setBusy(true);
  try {
    await requireAccount().resetPassword(String(signinIdentifierInput?.value || ""));
    setAuthError("If an account exists for that email, a password reset link has been sent.");
  } catch (err) { setAuthError(friendlyAuthError(err)); }
  finally { setBusy(false); }
});

signinPasswordInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !signinBtn?.disabled) signinBtn?.click();
});
signupPassword2?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !signupBtn?.disabled) signupBtn?.click();
});

signinBtn?.addEventListener("click", async () => {
  setAuthError("");
  const identifier = String(signinIdentifierInput?.value || "").trim();
  const password = String(signinPasswordInput?.value || "");
  if (!identifier || !password) {
    setAuthError("Email and password are required.");
    return;
  }
  try {
    setBusy(true);
    const account = requireAccount();
    if (account.signInWithIdentifier) {
      await account.signInWithIdentifier(identifier, password);
    } else {
      await account.signInWithEmail(identifier, password);
    }
    closeAuthModal();
    if (signinPasswordInput) signinPasswordInput.value = "";
  } catch (err: any) {
    setAuthError(friendlyAuthError(err));
  } finally {
    setBusy(false);
  }
});

signupUsername?.addEventListener("blur", async () => {
  if (!signupUsername || !usernameStatus) return;
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
    const ok = await requireAccount().isUsernameAvailable?.(username);
    usernameStatus.textContent = ok ? "Username is available!" : "Username is taken.";
    usernameStatus.className = ok ? "status-note good" : "status-note bad";
  } catch {
    usernameStatus.textContent = "Could not check username.";
    usernameStatus.className = "status-note bad";
  }
});

signupBtn?.addEventListener("click", async () => {
  setAuthError("");
  const firstName = String(signupFirstName?.value || "").trim();
  const lastName = String(signupLastName?.value || "").trim();
  const email = String(signupEmail?.value || "").trim();
  const phone = String(signupPhone?.value || "").trim();
  const username = String(signupUsername?.value || "").trim().toLowerCase();
  const playerName = String(signupPlayerName?.value || `${firstName} ${lastName}`).trim();
  const password = String(signupPassword?.value || "");
  const password2 = String(signupPassword2?.value || "");

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
    } else {
      await account.signUpWithEmail(email, password, playerName || username);
    }
    closeAuthModal();
    if (signupPassword) signupPassword.value = "";
    if (signupPassword2) signupPassword2.value = "";
  } catch (err: any) {
    setAuthError(friendlyAuthError(err));
  } finally {
    setBusy(false);
  }
});

photoUploadInput?.addEventListener("change", async () => {
  setAccountError("");
  const file = photoUploadInput.files?.[0];
  if (!file) return;
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
    if (profilePhoto && pendingPhotoData) (profilePhoto as HTMLImageElement).src = pendingPhotoData;
  };
  reader.readAsDataURL(file);
});

saveProfileBtn?.addEventListener("click", async () => {
  setAccountError("");
  try {
    setBusy(true);
    const account = requireAccount();
    const next = await account.updateAccountProfile?.({
      username: usernameLockedInput?.value || undefined,
      playerName: String(playerNameInput?.value || "").trim(),
      firstName: String(firstNameInput?.value || "").trim(),
      lastName: String(lastNameInput?.value || "").trim(),
      phone: String(phoneInput?.value || "").trim(),
      photoURL: pendingPhotoData || undefined
    });
    pendingPhotoData = "";
    if (next) {
      if ((next as any).username && usernameLockedInput) { usernameLockedInput.disabled = true; usernameLockedInput.readOnly = true; if (profileUsername) profileUsername.textContent = (next as any).username; }
      if (profilePlayerName) profilePlayerName.textContent = String((next as any).playerName || "");
      if (profilePhoto && (next as any).photoURL) {
        (profilePhoto as HTMLImageElement).src = String((next as any).photoURL);
      }
    }
  } catch (err: any) {
    setAccountError(err?.message || "Failed to save profile.");
  } finally {
    setBusy(false);
  }
});

signOutBtn?.addEventListener("click", async () => {
  setAccountError("");
  try {
    setBusy(true);
    await requireAccount().signOut();
  } catch (err: any) {
    setAccountError(err?.message || "Sign-out failed.");
  } finally {
    setBusy(false);
  }
});
