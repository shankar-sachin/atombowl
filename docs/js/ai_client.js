// @ts-nocheck
// Calls the `ai` endpoint for Tutor and Generate: functions/api/ai.js on Vercel in production,
// or the same logic as a Firebase callable (functions/index.js) in the local emulators.
// The server checks sign-in and credits; this module only shapes requests and errors.
import { app, useEmulators } from "./firebase.js";
import { getFunctions, httpsCallable, httpsCallableFromURL, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-functions.js";
// Also in status.ts, which loads without the Firebase SDK.
export const AI_URL = "https://atombowl-ai.vercel.app/api/ai";
const functions = getFunctions(app, "us-central1");
if (useEmulators)
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
const callAi = useEmulators
    ? httpsCallable(functions, "ai", { timeout: 70000 })
    : httpsCallableFromURL(functions, AI_URL, { timeout: 70000 });
// The live status page (src/html/status.html, served at /status by a hosting rewrite).
export const STATUS_URL = "https://atombowl.web.app/status";
export const API_ISSUE_MESSAGE = `We're extremely sorry. There seems to be an API issue. We're fixing it. Check the live status at: ${STATUS_URL}`;
export const BLOCKED_MESSAGE = "The API is down on this network.";
const BLOCKED_DETAIL = "School and work networks often block AI sites, so this is likely your school's network policy, not a problem with Atom Bowl or your account. Try again at home or on phone data, or ask your school's IT team to allow atombowl-ai.vercel.app.";
// A short message with an (i) that opens the explanation. Styled by .info-more in atom.css.
export function withInfoHtml(short, detail) {
    return `${short} <details class="info-more"><summary class="info-i" title="Learn more" aria-label="Learn more">i</summary><span class="info-more-text">${detail}</span></details>`;
}
// The same message with the status URL as a link, for error areas that render HTML.
export function apiIssueHtml() {
    const [before] = API_ISSUE_MESSAGE.split(STATUS_URL);
    return `${before}<a href="${STATUS_URL}" target="_blank" rel="noopener">${STATUS_URL.replace(/^https:\/\//, "")}</a>`;
}
const listeners = new Set();
let lastCredits = null;
function setCredits(credits) {
    if (!credits || typeof credits.remaining !== "number")
        return;
    lastCredits = credits;
    listeners.forEach((cb) => { try {
        cb(credits);
    }
    catch { } });
}
// Problems on our side or the provider's (a missing or crashed function, which comes back as
// a bare "internal", or a failed model call) get the API-issue message. Credits, sign-in and
// the user's own connection keep their specific messages.
function isApiIssue(code, message) {
    if (code === "unavailable")
        return !/fetch|network/i.test(message);
    return code === "internal" || code === "not-found" || code === "deadline-exceeded";
}
function friendlyError(err) {
    var _a, _b;
    const code = String((err === null || err === void 0 ? void 0 : err.code) || "").replace(/^functions\//, "");
    const message = String((err === null || err === void 0 ? void 0 : err.message) || "");
    if ((_a = err === null || err === void 0 ? void 0 : err.details) === null || _a === void 0 ? void 0 : _a.credits)
        setCredits(err.details.credits);
    if (((_b = err === null || err === void 0 ? void 0 : err.details) === null || _b === void 0 ? void 0 : _b.reason) === "email-unverified")
        return message;
    if (code === "unauthenticated" || code === "permission-denied")
        return "Sign in to use Tutor and Generate.";
    if (isApiIssue(code, message))
        return API_ISSUE_MESSAGE;
    if (code === "unavailable")
        return "Couldn't reach Atom Bowl. Check your connection and try again.";
    return message || "Something went wrong. Try again.";
}
// A school or work filter that blocks the AI host either drops the request (no response, which
// the SDK reports as "internal") or answers with its own block page (no JSON body, so the
// message is just the bare code). Server errors always carry a JSON message.
function maybeBlocked(err) {
    const code = String((err === null || err === void 0 ? void 0 : err.code) || "").replace(/^functions\//, "");
    const message = String((err === null || err === void 0 ? void 0 : err.message) || "");
    if (code === "internal" || code === "unavailable" || code === "deadline-exceeded")
        return true;
    return (code === "permission-denied" || code === "unauthenticated" || code === "not-found") && message === code;
}
// The public health action needs no sign-in. If even that can't come back as JSON, this
// network is blocking the AI host; if it does, the failure was on our side.
async function aiHostReachable() {
    try {
        const res = await fetch(AI_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ data: { action: "health" } }),
            signal: AbortSignal.timeout(10000)
        });
        const body = await res.json();
        return !!(body === null || body === void 0 ? void 0 : body.result);
    }
    catch {
        return false;
    }
}
async function run(payload) {
    var _a;
    try {
        const result = await callAi(payload);
        setCredits((_a = result.data) === null || _a === void 0 ? void 0 : _a.credits);
        return result.data;
    }
    catch (err) {
        if (!useEmulators && navigator.onLine !== false && maybeBlocked(err) && !(await aiHostReachable())) {
            const blocked = new Error(BLOCKED_MESSAGE);
            blocked.code = err === null || err === void 0 ? void 0 : err.code;
            blocked.blocked = true;
            blocked.html = withInfoHtml(BLOCKED_MESSAGE, BLOCKED_DETAIL);
            throw blocked;
        }
        const wrapped = new Error(friendlyError(err));
        wrapped.code = err === null || err === void 0 ? void 0 : err.code;
        wrapped.apiIssue = wrapped.message === API_ISSUE_MESSAGE;
        if (wrapped.apiIssue)
            wrapped.html = apiIssueHtml();
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
        if (lastCredits)
            cb(lastCredits);
        return () => listeners.delete(cb);
    }
};
export function creditLabel(credits) {
    if (!credits)
        return "";
    return `${credits.remaining} of ${credits.limit} credits left today`;
}
//# sourceMappingURL=ai_client.js.map