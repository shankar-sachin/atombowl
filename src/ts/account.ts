import "./account_store.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

const statusText = $("statusText");
const statusSub = $("statusSub");
const guestTagEl = $("guestTag");
const guestRow = guestTagEl?.closest?.(".guest-row") as HTMLElement | null;
const profileUsername = $("profileUsername");
const profileUsernameRow = $("profileUsernameRow");
const profilePlayerName = $("profilePlayerName");
const profileEmail = $("profileEmail");
const profilePhoto = $<HTMLImageElement>("profilePhoto");
const profileInitial = $("profileInitial");
const signedOutActions = $("signedOutActions");
const signedInPanel = $<HTMLFormElement>("signedInPanel");
const signOutBtn = $<HTMLButtonElement>("signOutBtn");
const syncNotice = $("syncNotice");
const verifyNotice = $("verifyNotice");
const verifyNoticeText = $("verifyNoticeText");
const verifyResendBtn = $<HTMLButtonElement>("verifyResendBtn");
const verifyCheckBtn = $<HTMLButtonElement>("verifyCheckBtn");
const syncNoticeText = $("syncNoticeText");
const retrySyncBtn = $<HTMLButtonElement>("retrySyncBtn");
const toastEl = $("accountToast");

const playerNameInput = $<HTMLInputElement>("playerNameInput");
const firstNameInput = $<HTMLInputElement>("firstNameInput");
const lastNameInput = $<HTMLInputElement>("lastNameInput");
const phoneInput = $<HTMLInputElement>("phoneInput");
const usernameLockedInput = $<HTMLInputElement>("usernameLockedInput");
const usernameLockedHint = $("usernameLockedHint");
const emailLockedInput = $<HTMLInputElement>("emailLockedInput");
const photoUploadInput = $<HTMLInputElement>("photoUploadInput");
const photoHint = $("photoHint");
const saveProfileBtn = $<HTMLButtonElement>("saveProfileBtn");
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
const signInFormPanel = $<HTMLFormElement>("signInFormPanel");
const signUpFormPanel = $<HTMLFormElement>("signUpFormPanel");
const authModalTitle = $("authModalTitle");
const gotoSignupLink = $("gotoSignupLink");
const gotoSigninLink = $("gotoSigninLink");
const authError = $("authError");
const authStatus = $("authStatus");
const usernameStatus = $("usernameStatus");

const googleBtn = $<HTMLButtonElement>("googleBtn");
const signinIdentifierInput = $<HTMLInputElement>("signinIdentifierInput");
const signinPasswordInput = $<HTMLInputElement>("signinPasswordInput");
const signinBtn = $<HTMLButtonElement>("signinBtn");
const resetPasswordBtn = $<HTMLButtonElement>("resetPasswordBtn");

const signupFirstName = $<HTMLInputElement>("signupFirstName");
const signupLastName = $<HTMLInputElement>("signupLastName");
const signupEmail = $<HTMLInputElement>("signupEmail");
const signupPhone = $<HTMLInputElement>("signupPhone");
const signupUsername = $<HTMLInputElement>("signupUsername");
const signupPlayerName = $<HTMLInputElement>("signupPlayerName");
const guestNameForm = $("guestNameForm");
const guestNameInput = $<HTMLInputElement>("guestNameInput");
const guestNameHint = $("guestNameHint");
const signupPassword = $<HTMLInputElement>("signupPassword");
const signupPassword2 = $<HTMLInputElement>("signupPassword2");
const signupBtn = $<HTMLButtonElement>("signupBtn");

const USERNAME_RE = /^[a-z0-9]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let pendingPhotoData = "";
let lastFocus: HTMLElement | null = null;
let toastTimer = 0;

// The shared Window typing in globals.d.ts predates the newer store helpers.
function requireAccount(): any {
  const account = (window as any).atomAccount;
  if (!account) throw new Error("The account module did not load. Check your connection and reload the page.");
  return account;
}

/* ---------- Messages ---------- */

function setAuthError(msg = "") {
  if (authError) authError.textContent = msg;
  if (msg && authStatus) authStatus.textContent = "";
}

function setAuthStatus(msg = "") {
  if (authStatus) authStatus.textContent = msg;
  if (msg && authError) authError.textContent = "";
}

function setAccountError(msg = "") {
  if (accountErrorEl) accountErrorEl.textContent = msg;
  if (msg && accountStatusEl) accountStatusEl.textContent = "";
}

function setAccountStatus(msg = "") {
  if (accountStatusEl) accountStatusEl.textContent = msg;
}

function showToast(msg: string) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 3200);
}

const VERIFY_TEXT = "Confirm your email to use Tutor and Generate. We sent a link to your inbox.";

function renderVerifyNotice(user: any) {
  let needed = false;
  try { needed = !!requireAccount().needsEmailVerification?.(user); } catch {}
  verifyNotice?.classList.toggle("hidden", !needed);
  if (!needed && verifyNoticeText) verifyNoticeText.textContent = VERIFY_TEXT;
}

async function checkVerification({ quiet = false } = {}) {
  try {
    const ok = await requireAccount().refreshVerification?.();
    if (ok) {
      renderVerifyNotice(requireAccount().getUser?.());
      showToast("Email confirmed. Tutor and Generate are ready.");
    } else if (!quiet && verifyNoticeText) {
      verifyNoticeText.textContent = "Not confirmed yet. Open the link in the email, then press I've confirmed it.";
    }
  } catch (err: any) {
    if (!quiet && verifyNoticeText) verifyNoticeText.textContent = `Couldn't check (${friendlyAuthError(err)}). Try again.`;
  }
}

function renderSyncNotice() {
  if (!syncNotice || !syncNoticeText) return;
  let msg = "";
  try {
    const account = requireAccount();
    if (account.getUser?.()) {
      msg = account.getSyncError?.() || "";
      const writeErr = account.getLastWriteError?.();
      if (!msg && writeErr) {
        const when = new Date(Number(writeErr.at) || Date.now()).toLocaleString();
        msg = `Your ${writeErr.what} did not save on ${when} (${writeErr.code}). Check your connection, then try again.`;
      }
    }
  } catch {}
  syncNoticeText.textContent = msg;
  syncNotice.classList.toggle("hidden", !msg);
}

/* ---------- Busy state ---------- */

function setBusy(isBusy: boolean, active?: HTMLButtonElement | null, busyText?: string) {
  document.querySelectorAll<HTMLButtonElement>("[data-auth-action]").forEach((el) => {
    el.disabled = isBusy;
  });
  if (!active) return;
  active.disabled = isBusy;
  const label = active.querySelector(".btn-label") as HTMLElement | null || active;
  if (isBusy) {
    if (active.dataset.idleHtml == null) active.dataset.idleHtml = label.innerHTML;
    if (busyText) label.textContent = busyText;
    active.setAttribute("aria-busy", "true");
  } else {
    if (active.dataset.idleHtml != null) label.innerHTML = active.dataset.idleHtml;
    delete active.dataset.idleHtml;
    active.removeAttribute("aria-busy");
  }
}

async function withBusy<T>(button: HTMLButtonElement | null, busyText: string, task: () => Promise<T>) {
  setBusy(true, button, busyText);
  try {
    return await task();
  } finally {
    setBusy(false, button);
  }
}

/* ---------- Errors ---------- */

function friendlyAuthError(err: any): string {
  const code = err?.code || "";
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
      return err?.message && !String(err.message).startsWith("Firebase:")
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
      const msg = String(err?.message || "");
      if (!msg) return "Something went wrong. Try again.";
      return msg.replace(/^Firebase:\s*/, "");
    }
  }
}

/* ---------- Rendering ---------- */

function toReadableTime(totalSeconds: number) {
  const s = Math.max(0, Math.round(Number(totalSeconds || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fallbackGuestTag() {
  const key = "atom_guest_tag_v1";
  let existing = "";
  try { existing = (localStorage.getItem(key) || "").trim(); } catch {}
  if (/^[A-Za-z0-9]{12}$/.test(existing)) return existing;
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let tag = "";
  for (let i = 0; i < 12; i += 1) tag += chars[Math.floor(Math.random() * chars.length)];
  try { localStorage.setItem(key, tag); } catch {}
  return tag;
}

function setStatusTag(state: "checking" | "out" | "in") {
  if (!statusText) return;
  statusText.className = state === "in" ? "tag good" : "tag";
  statusText.textContent = state === "in" ? "Signed in" : state === "out" ? "Signed out" : "Checking sign-in";
}

function setAvatar(photo: string, name: string) {
  if (profilePhoto) {
    if (photo) profilePhoto.src = photo;
    else profilePhoto.removeAttribute("src");
    profilePhoto.classList.toggle("hidden", !photo);
  }
  if (profileInitial) {
    profileInitial.classList.toggle("hidden", !!photo);
    const initial = name.trim().charAt(0).toUpperCase();
    if (initial) profileInitial.textContent = initial;
    else profileInitial.innerHTML = window.atomIcon?.("user") || "";
  }
}

function setStats(stats: any) {
  const runs = Number(stats?.totalRuns || 0);
  const answered = Number(stats?.totalAnswered || 0);
  const correct = Number(stats?.totalCorrect || 0);
  const totalTime = Number(stats?.totalTime || 0);
  if (statRuns) statRuns.textContent = String(runs);
  if (statAvgScore) statAvgScore.textContent = runs > 0 ? (correct / runs).toFixed(1) : "0.0";
  if (statTimePlayed) statTimePlayed.textContent = toReadableTime(totalTime);
  if (statAccuracy) statAccuracy.textContent = answered > 0 ? `${Math.round((correct / answered) * 100)}%` : "0%";
}

async function renderStats() {
  const account = requireAccount();
  const user = account.getUser();
  try {
    const stats = await account.loadPracticeStats?.();
    if (account.getUser() !== user) return;
    setStats(stats);
    if (statsNote) {
      statsNote.className = "status-note";
      statsNote.textContent = Number(stats?.totalRuns || 0) > 0
        ? "Totals from every solo practice run while signed in."
        : "No runs saved yet. Finish a solo practice run while signed in and it shows up here.";
    }
  } catch (err: any) {
    if (account.getUser() !== user) return;
    console.warn("Atom Bowl: loading practice stats failed", err);
    if (statsNote) {
      statsNote.className = "status-note bad";
      statsNote.textContent = `Couldn't load your stats (${String(err?.code || err?.message || "error")}). Reload to try again.`;
    }
  }
}

// While Firebase loads, show the last signed-in account from the hint common.ts also uses,
// instead of a guest card that then flips to signed in.
function renderChecking() {
  setStatusTag("checking");
  let hint: any = null;
  try { hint = JSON.parse(localStorage.getItem("atom_account_hint_v1") || "null"); } catch {}
  if (!hint?.uid) {
    if (statusSub) statusSub.textContent = "Looking for a saved sign-in on this device.";
    return;
  }
  if (statusSub) statusSub.textContent = "Loading your account…";
  if (profilePlayerName) profilePlayerName.textContent = hint.name || "Player";
  if (profileUsername) profileUsername.textContent = hint.username || "";
  profileUsernameRow?.classList.toggle("hidden", !hint.username);
  if (profileEmail) profileEmail.textContent = hint.email || "";
  setAvatar(hint.photo || "", hint.name || "");
  signedOutActions?.classList.add("hidden");
  guestRow?.classList.add("hidden");
}

function localName() {
  try { return String(requireAccount().getLocalName?.() || ""); } catch { return ""; }
}

function renderSignedOut() {
  const name = localName();
  if (guestNameInput && document.activeElement !== guestNameInput) guestNameInput.value = name;
  let tag = "";
  try { tag = requireAccount().getGuestTag?.() || ""; } catch {}
  setStatusTag("out");
  verifyNotice?.classList.add("hidden");
  if (statusSub) statusSub.textContent = "You're practicing as a guest. Progress stays in this browser only.";
  if (profileUsernameRow) profileUsernameRow.classList.add("hidden");
  if (profileUsername) profileUsername.textContent = "";
  if (profilePlayerName) profilePlayerName.textContent = name || "Guest";
  if (profileEmail) profileEmail.textContent = "Not signed in";
  setAvatar("", name);
  if (usernameLockedInput) usernameLockedInput.value = "";
  if (emailLockedInput) emailLockedInput.value = "";
  if (guestTagEl) guestTagEl.textContent = tag || fallbackGuestTag();
  guestRow?.classList.remove("hidden");
  signedOutActions?.classList.remove("hidden");
  signedInPanel?.classList.add("hidden");
  setStats(null);
  if (statsNote) {
    statsNote.className = "status-note";
    statsNote.textContent = "Sign in to keep stats from your practice runs.";
  }
  setAccountError("");
  setAccountStatus("");
  renderSyncNotice();
}

async function renderSignedIn(user: any) {
  const account = requireAccount();
  const profile = account.getProfile?.() || {};
  const username = String(profile?.username || "").trim();
  const playerName = String(profile?.playerName || profile?.displayName || user?.displayName || username || String(user?.email || "").split("@")[0] || "Player");
  const email = String(profile?.email || user?.email || "");
  const photo = String(profile?.photoURL || user?.photoURL || "");

  setStatusTag("in");
  renderVerifyNotice(user);
  // Arriving from the verification email's continue link.
  if (new URLSearchParams(location.search).get("verified") === "1") {
    history.replaceState(null, "", location.pathname + location.hash);
    void checkVerification({ quiet: true });
  }
  if (statusSub) {
    const providers: string[] = Array.isArray(user?.providerData) ? user.providerData.map((p: any) => p?.providerId) : [];
    statusSub.textContent = providers.includes("google.com")
      ? "Signed in with Google. Your stats and settings save to this account."
      : "Signed in with email. Your stats and settings save to this account.";
  }
  guestRow?.classList.add("hidden");
  if (profileUsername) profileUsername.textContent = username;
  profileUsernameRow?.classList.toggle("hidden", !username);
  if (profilePlayerName) profilePlayerName.textContent = playerName;
  if (profileEmail) profileEmail.textContent = email || "No email on this account";
  setAvatar(pendingPhotoData || photo, playerName);
  signedOutActions?.classList.add("hidden");
  signedInPanel?.classList.remove("hidden");

  if (playerNameInput) playerNameInput.value = playerName;
  if (firstNameInput) firstNameInput.value = String(profile?.firstName || "");
  if (lastNameInput) lastNameInput.value = String(profile?.lastName || "");
  if (phoneInput) phoneInput.value = String(profile?.phone || "");
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
  if (emailLockedInput) emailLockedInput.value = email;

  renderSyncNotice();
  await renderStats();
}

async function handleAuthChange(user: any) {
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

function moveErrorSlot(mode: "signin" | "signup") {
  const slot = document.querySelector(`[data-error-slot="${mode}"]`);
  if (slot && authError && authError.parentElement !== slot) {
    slot.appendChild(authError);
    if (authStatus) slot.appendChild(authStatus);
  }
}

function switchAuthPanel(mode: "signin" | "signup") {
  const isSignIn = mode === "signin";
  signInFormPanel?.classList.toggle("hidden", !isSignIn);
  signUpFormPanel?.classList.toggle("hidden", isSignIn);
  showSignInTab?.classList.toggle("active", isSignIn);
  showSignUpTab?.classList.toggle("active", !isSignIn);
  showSignInTab?.setAttribute("aria-selected", String(isSignIn));
  showSignUpTab?.setAttribute("aria-selected", String(!isSignIn));
  if (authModalTitle) authModalTitle.textContent = isSignIn ? "Sign in" : "Create account";
  moveErrorSlot(mode);
  setAuthError("");
  setAuthStatus("");
}

function openAuthModal(mode: "signin" | "signup") {
  if (!authModal) return;
  lastFocus = document.activeElement as HTMLElement | null;
  switchAuthPanel(mode);
  if (signupPlayerName && !signupPlayerName.value) signupPlayerName.value = localName();
  authModal.classList.remove("hidden");
  const first = mode === "signin" ? signinIdentifierInput : signupFirstName;
  first?.focus();
}

function closeAuthModal() {
  if (!authModal || authModal.classList.contains("hidden")) return;
  authModal.classList.add("hidden");
  lastFocus?.focus?.();
}

/* ---------- Sign-up field validation ---------- */

function fieldError(input: HTMLInputElement | null, msg: string) {
  if (!input) return;
  const el = document.getElementById(`${input.id}Error`);
  if (el) el.textContent = msg;
  if (msg) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

function setUsernameStatus(msg: string, tone: "" | "good" | "bad" = "") {
  if (!usernameStatus) return;
  usernameStatus.textContent = msg;
  usernameStatus.className = tone ? `status-note ${tone}` : "status-note";
  if (tone === "bad") signupUsername?.setAttribute("aria-invalid", "true");
  else signupUsername?.removeAttribute("aria-invalid");
}

function passwordChecks(pw: string) {
  return {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw)
  } as Record<string, boolean>;
}

function renderPasswordRules() {
  const checks = passwordChecks(String(signupPassword?.value || ""));
  document.querySelectorAll<HTMLElement>("#passwordHint [data-rule]").forEach((li) => {
    li.classList.toggle("met", !!checks[li.dataset.rule || ""]);
  });
}

function validateField(input: HTMLInputElement | null): boolean {
  if (!input) return true;
  const value = input.value.trim();
  let msg = "";
  switch (input) {
    case signupFirstName:
      if (!value) msg = "Enter your first name.";
      break;
    case signupLastName:
      if (!value) msg = "Enter your last name.";
      break;
    case signupEmail:
      if (!value) msg = "Enter your email address.";
      else if (!EMAIL_RE.test(value)) msg = "Enter a valid email address, like you@example.com.";
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
      if (!input.value) msg = "Choose a password.";
      else if (missing.length) msg = `Add ${missing.join(", ")}.`;
      break;
    }
    case signupPassword2:
      if (!input.value) msg = "Type your password again.";
      else if (input.value !== String(signupPassword?.value || "")) msg = "Passwords don't match.";
      break;
  }
  fieldError(input, msg);
  return !msg;
}

// Username fields check Firestore as you type (after a short pause) and say whether the name
// is free. Signup uses #usernameStatus; the profile form uses the username hint.
const USERNAME_DEBOUNCE_MS = 350;

function usernameChecker(input: HTMLInputElement | null, show: (msg: string, tone?: "" | "good" | "bad") => void) {
  let seq = 0;
  let timer = 0;
  async function check(): Promise<boolean> {
    window.clearTimeout(timer);
    if (!input || input.readOnly) return true;
    const username = input.value.trim().toLowerCase();
    if (input.value !== username) input.value = username;
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
      const ok = await requireAccount().isUsernameAvailable?.(username);
      if (mine === seq) show(ok ? "Yes, available" : `"${username}" is taken. Try another one.`, ok ? "good" : "bad");
      return !!ok;
    } catch (err: any) {
      if (mine === seq) show(`Couldn't check this username (${err?.code || "network error"}). It's checked again when you save.`);
      return true;
    }
  }
  input?.addEventListener("input", () => {
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
  if (!usernameLockedHint) return;
  usernameLockedHint.textContent = msg || "Pick a username: 3 to 20 lowercase letters or numbers. It can't be changed later.";
  usernameLockedHint.classList.toggle("good", tone === "good");
  usernameLockedHint.classList.toggle("bad", tone === "bad");
});

const signupFields = [signupFirstName, signupLastName, signupEmail, signupPassword, signupPassword2];
signupFields.forEach((input) => {
  input?.addEventListener("blur", () => { if (input.value) validateField(input); });
  input?.addEventListener("input", () => {
    if (input.getAttribute("aria-invalid") === "true") validateField(input);
  });
});
signupPassword?.addEventListener("input", () => {
  renderPasswordRules();
  if (signupPassword2?.value) validateField(signupPassword2);
});
signupUsername?.addEventListener("blur", () => { if (signupUsername.value.trim()) void checkUsername(); });

/* ---------- Wiring ---------- */

const account0 = (window as any).atomAccount;
if (account0?.onAuthChange) {
  renderChecking();
  account0.onAuthChange((user: any) => {
    handleAuthChange(user).catch((err: any) => setAccountError(friendlyAuthError(err)));
  });
} else {
  renderSignedOut();
  if (statusSub) statusSub.textContent = "Accounts are unavailable right now because the sign-in service didn't load. Check your connection and reload.";
}

guestNameForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  let saved = "";
  try { saved = String(requireAccount().setLocalName?.(guestNameInput?.value || "") || ""); } catch {}
  if (guestNameInput) guestNameInput.value = saved;
  if (profilePlayerName) profilePlayerName.textContent = saved || "Guest";
  setAvatar("", saved);
  if (guestNameHint) guestNameHint.textContent = saved ? "Saved. Buzzer rooms will fill this in for you." : "Name cleared.";
});

openSignInBtn?.addEventListener("click", () => openAuthModal("signin"));
openSignUpBtn?.addEventListener("click", () => openAuthModal("signup"));
showSignInTab?.addEventListener("click", () => switchAuthPanel("signin"));
showSignUpTab?.addEventListener("click", () => switchAuthPanel("signup"));
gotoSignupLink?.addEventListener("click", (e) => { e.preventDefault(); switchAuthPanel("signup"); signupFirstName?.focus(); });
gotoSigninLink?.addEventListener("click", (e) => { e.preventDefault(); switchAuthPanel("signin"); signinIdentifierInput?.focus(); });
closeAuthModalBtn?.addEventListener("click", closeAuthModal);
authModal?.addEventListener("click", (e) => { if (e.target === authModal) closeAuthModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAuthModal(); });

// Resolve once the store has loaded the signed-in user's profile (or after a timeout).
function waitForAccountLoaded(timeoutMs = 6000): Promise<void> {
  return new Promise((resolve) => {
    let account: any;
    try { account = requireAccount(); } catch { resolve(); return; }
    let unsubscribe: (() => void) | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      queueMicrotask(() => unsubscribe?.());
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    unsubscribe = account.onAuthChange?.(() => {
      if (account.getUser?.() && (account.getProfile?.() || account.getSyncError?.())) finish();
    }) || null;
    if (done) unsubscribe?.();
  });
}

function welcomeName() {
  try {
    const account = requireAccount();
    const p = account.getProfile?.() || {};
    const u = account.getUser?.() || {};
    return String(p.playerName || p.username || u.displayName || u.email || "your account");
  } catch {
    return "your account";
  }
}

googleBtn?.addEventListener("click", async () => {
  setAuthError("");
  try {
    await withBusy(googleBtn, "Waiting for Google…", async () => {
      await requireAccount().signInWithProvider("google");
      await waitForAccountLoaded();
    });
    closeAuthModal();
    showToast(`Signed in as ${welcomeName()}`);
  } catch (err: any) {
    setAuthError(friendlyAuthError(err));
  }
});

resetPasswordBtn?.addEventListener("click", async () => {
  const email = String(signinIdentifierInput?.value || "").trim();
  if (!email) {
    setAuthError("Enter your email above, then choose \"Forgot password?\" again.");
    signinIdentifierInput?.focus();
    return;
  }
  try {
    await withBusy(resetPasswordBtn, "Sending…", () => requireAccount().resetPassword(email));
    setAuthStatus(`If an account exists for ${email}, a reset link is on its way. Check your inbox.`);
  } catch (err) {
    setAuthError(friendlyAuthError(err));
  }
});

signInFormPanel?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (signinBtn?.disabled) return;
  setAuthError("");
  const identifier = String(signinIdentifierInput?.value || "").trim();
  const password = String(signinPasswordInput?.value || "");
  if (!identifier) {
    setAuthError("Enter your email address.");
    signinIdentifierInput?.focus();
    return;
  }
  if (!EMAIL_RE.test(identifier)) {
    setAuthError("Enter the email address you signed up with, like you@example.com.");
    signinIdentifierInput?.focus();
    return;
  }
  if (!password) {
    setAuthError("Enter your password.");
    signinPasswordInput?.focus();
    return;
  }
  try {
    await withBusy(signinBtn, "Signing in…", async () => {
      const account = requireAccount();
      if (account.signInWithIdentifier) await account.signInWithIdentifier(identifier, password);
      else await account.signInWithEmail(identifier, password);
      await waitForAccountLoaded();
    });
    if (signinPasswordInput) signinPasswordInput.value = "";
    closeAuthModal();
    showToast(`Signed in as ${welcomeName()}`);
  } catch (err: any) {
    setAuthError(friendlyAuthError(err));
    signinPasswordInput?.select();
  }
});

signUpFormPanel?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (signupBtn?.disabled) return;
  setAuthError("");
  const fieldsOk = signupFields.map((input) => validateField(input)).every(Boolean);
  const usernameOk = await checkUsername();
  if (!fieldsOk || !usernameOk) {
    setAuthError("Fix the highlighted fields to create your account.");
    const firstBad = signUpFormPanel.querySelector<HTMLInputElement>('[aria-invalid="true"]');
    firstBad?.focus();
    return;
  }

  const firstName = String(signupFirstName?.value || "").trim();
  const lastName = String(signupLastName?.value || "").trim();
  const email = String(signupEmail?.value || "").trim();
  const phone = String(signupPhone?.value || "").trim();
  const username = String(signupUsername?.value || "").trim().toLowerCase();
  const playerName = String(signupPlayerName?.value || "").trim() || `${firstName} ${lastName}`.trim();
  const password = String(signupPassword?.value || "");

  try {
    await withBusy(signupBtn, "Creating account…", async () => {
      const account = requireAccount();
      if (account.signUpWithDetails) {
        await account.signUpWithDetails({ firstName, lastName, email, phone, username, password, playerName });
      } else {
        await account.signUpWithEmail(email, password, playerName || username);
      }
    });
    if (signupPassword) signupPassword.value = "";
    if (signupPassword2) signupPassword2.value = "";
    renderPasswordRules();
    closeAuthModal();
    showToast(`Account created. Signed in as ${welcomeName()}`);
  } catch (err: any) {
    const code = err?.code || "";
    if (code === "atom/profile-partial") {
      // The login exists and is signed in; show the explanation on the page.
      closeAuthModal();
      setAccountError(err.message);
      return;
    }
    if (code === "atom/username-taken") {
      setUsernameStatus(`"${username}" is taken. Try another one.`, "bad");
      signupUsername?.focus();
    } else if (code === "auth/email-already-in-use" || code === "auth/invalid-email") {
      fieldError(signupEmail, friendlyAuthError(err));
      signupEmail?.focus();
    } else if (code === "auth/password-does-not-meet-requirements" || code === "auth/weak-password") {
      fieldError(signupPassword, friendlyAuthError(err));
      signupPassword?.focus();
    }
    setAuthError(friendlyAuthError(err));
  }
});

// Photos are cropped to a square and shrunk to a small JPEG here, so any camera photo fits in
// the profile document, then saved straight away.
const PHOTO_SIZE = 256;
const PHOTO_HINT = "A JPG, PNG, GIF or WebP. It's cropped to a square and saves right away.";

function setPhotoHint(text: string, tone: "" | "good" | "bad" = "") {
  if (!photoHint) return;
  photoHint.textContent = text || PHOTO_HINT;
  photoHint.classList.toggle("good", tone === "good");
  photoHint.classList.toggle("bad", tone === "bad");
}

async function shrinkPhoto(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("empty image");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = PHOTO_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

photoUploadInput?.addEventListener("change", async () => {
  setAccountError("");
  const file = photoUploadInput.files?.[0];
  if (!file) return;
  if (file.size > 20_000_000) {
    setPhotoHint("That file is over 20 MB. Choose a smaller picture.", "bad");
    photoUploadInput.value = "";
    return;
  }
  let photo = "";
  try {
    photo = await shrinkPhoto(file);
  } catch {
    setPhotoHint("Couldn't open that picture. Choose a JPG, PNG, GIF or WebP.", "bad");
    photoUploadInput.value = "";
    return;
  }
  setAvatar(photo, String(playerNameInput?.value || ""));
  setPhotoHint("Saving your picture…");
  try {
    await requireAccount().updateAccountProfile?.({ photoURL: photo });
    pendingPhotoData = "";
    setPhotoHint("Picture saved.", "good");
    showToast("Picture saved");
  } catch (err: any) {
    // Keep it so Save profile can try again.
    pendingPhotoData = photo;
    setPhotoHint(`Picture not saved. ${friendlyAuthError(err)} Press Save profile to try again.`, "bad");
  } finally {
    photoUploadInput.value = "";
  }
});

signedInPanel?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (saveProfileBtn?.disabled) return;
  setAccountError("");
  setAccountStatus("");
  const playerName = String(playerNameInput?.value || "").trim();
  if (!playerName) {
    setAccountError("Enter a player name. It's the name other players see in buzzer rooms.");
    playerNameInput?.focus();
    return;
  }
  const typedUsername = usernameLockedInput && !usernameLockedInput.readOnly
    ? usernameLockedInput.value.trim().toLowerCase()
    : "";
  if (typedUsername && !USERNAME_RE.test(typedUsername)) {
    setAccountError("Usernames are 3 to 20 lowercase letters or numbers, with no spaces or symbols.");
    usernameLockedInput?.focus();
    return;
  }
  if (typedUsername && !(await checkProfileUsername())) {
    usernameLockedInput?.focus();
    return;
  }
  try {
    const next: any = await withBusy(saveProfileBtn, "Saving…", () => requireAccount().updateAccountProfile?.({
      username: typedUsername || usernameLockedInput?.value || undefined,
      playerName,
      firstName: String(firstNameInput?.value || "").trim(),
      lastName: String(lastNameInput?.value || "").trim(),
      phone: String(phoneInput?.value || "").trim(),
      photoURL: pendingPhotoData || undefined
    }));
    pendingPhotoData = "";
    if (photoUploadInput) photoUploadInput.value = "";
    if (next) {
      const user = requireAccount().getUser?.();
      if (user) await renderSignedIn(user);
    }
    setAccountStatus("Profile saved.");
    showToast("Profile saved");
  } catch (err: any) {
    setAccountError(`Profile not saved. ${friendlyAuthError(err)}`);
  }
});

verifyResendBtn?.addEventListener("click", async () => {
  try {
    await withBusy(verifyResendBtn, "Sending…", () => requireAccount().sendVerification());
    if (verifyNoticeText) verifyNoticeText.textContent = "New link sent. Check your inbox and spam folder.";
  } catch (err: any) {
    if (verifyNoticeText) verifyNoticeText.textContent = err?.code === "auth/too-many-requests"
      ? "We just sent one. Wait a minute before asking for another."
      : `Couldn't send the link (${friendlyAuthError(err)}).`;
  }
});

verifyCheckBtn?.addEventListener("click", () => withBusy(verifyCheckBtn, "Checking…", () => checkVerification()));

// Coming back from the email link, or back to this tab after clicking it elsewhere.
window.addEventListener?.("focus", () => {
  if (verifyNotice && !verifyNotice.classList.contains("hidden")) void checkVerification({ quiet: true });
});

signOutBtn?.addEventListener("click", async () => {
  setAccountError("");
  try {
    await withBusy(signOutBtn, "Signing out…", () => requireAccount().signOut());
    showToast("Signed out");
  } catch (err: any) {
    setAccountError(`Sign-out failed. ${friendlyAuthError(err)}`);
  }
});

retrySyncBtn?.addEventListener("click", async () => {
  try {
    const account = requireAccount();
    account.clearLastWriteError?.();
    await withBusy(retrySyncBtn, "Trying again…", () => account.retrySync?.() || Promise.resolve());
    renderSyncNotice();
    if (!syncNotice || syncNotice.classList.contains("hidden")) showToast("Account synced");
  } catch (err: any) {
    if (syncNoticeText) syncNoticeText.textContent = `Still failing: ${friendlyAuthError(err)}`;
  }
});
