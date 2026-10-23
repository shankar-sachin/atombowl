// @ts-nocheck
// Calls the `ai` endpoint for Tutor and Generate: functions/api/ai.js on Vercel in production,
// or the same logic as a Firebase callable (functions/index.js) in the local emulators.
// The server checks sign-in and credits; this module only shapes requests and errors.
import { app, useEmulators } from "./firebase.js";
import { getFunctions, httpsCallable, httpsCallableFromURL, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-functions.js";

// Also in status.ts, which loads without the Firebase SDK.
export const AI_URL = "https://atombowl-ai.vercel.app/api/ai";

const functions = getFunctions(app, "us-central1");
if (useEmulators) connectFunctionsEmulator(functions, "127.0.0.1", 5001);
const callAi = useEmulators
  ? httpsCallable(functions, "ai", { timeout: 70000 })
  : httpsCallableFromURL(functions, AI_URL, { timeout: 70000 });

// The live status page (src/html/status.html, served at /status by a hosting rewrite).
export const STATUS_URL = "https://atombowl.web.app/status";
export const API_ISSUE_MESSAGE = `We're extremely sorry. There seems to be an API issue. We're fixing it. Check the live status at: ${STATUS_URL}`;

// The same message with the status URL as a link, for error areas that render HTML.
export function apiIssueHtml() {
  const [before] = API_ISSUE_MESSAGE.split(STATUS_URL);
  return `${before}<a href="${STATUS_URL}" target="_blank" rel="noopener">${STATUS_URL.replace(/^https:\/\//, "")}</a>`;
}

const listeners = new Set();
let lastCredits = null;

function setCredits(credits) {
  if (!credits || typeof credits.remaining !== "number") return;
  lastCredits = credits;
  listeners.forEach((cb) => { try { cb(credits); } catch {} });
}

// Problems on our side or the provider's (a missing or crashed function, which comes back as
// a bare "internal", or a failed model call) get the API-issue message. Credits, sign-in and
// the user's own connection keep their specific messages.
function isApiIssue(code, message) {
  if (code === "unavailable") return !/fetch|network/i.test(message);
  return code === "internal" || code === "not-found" || code === "deadline-exceeded";
}

function friendlyError(err) {
  const code = String(err?.code || "").replace(/^functions\//, "");
  const message = String(err?.message || "");
  if (err?.details?.credits) setCredits(err.details.credits);
  if (err?.details?.reason === "email-unverified") return message;
  if (code === "unauthenticated" || code === "permission-denied") return "Sign in to use Tutor and Generate.";
  if (isApiIssue(code, message)) return API_ISSUE_MESSAGE;
  if (code === "unavailable") return "Couldn't reach Atom Bowl. Check your connection and try again.";
  return message || "Something went wrong. Try again.";
}

async function run(payload) {
  try {
    const result = await callAi(payload);
    setCredits(result.data?.credits);
    return result.data;
  } catch (err) {
    const wrapped = new Error(friendlyError(err));
    wrapped.code = err?.code;
    wrapped.apiIssue = wrapped.message === API_ISSUE_MESSAGE;
    throw wrapped;
  }
}

export const aiClient = {
  status: () => run({ action: "status" }),
  tutor: (messages, context, thinking = false) => run({ action: "tutor", messages, context: context || null, thinking }),
  generate: (options) => run({ action: "generate", ...options }),
  getCredits: () => lastCredits,
  onCredits(cb) {
    listeners.add(cb);
    if (lastCredits) cb(lastCredits);
    return () => listeners.delete(cb);
  }
};

export function creditLabel(credits) {
  if (!credits) return "";
  return `${credits.remaining} of ${credits.limit} credits left today`;
}
