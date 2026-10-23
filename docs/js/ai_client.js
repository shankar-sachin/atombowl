// @ts-nocheck
// Calls the `ai` Cloud Function (functions/index.js) for Tutor and Generate.
// The function checks sign-in and credits; this module only shapes requests and errors.
import { app, useEmulators } from "./firebase.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-functions.js";
const functions = getFunctions(app, "us-central1");
if (useEmulators)
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
const callAi = httpsCallable(functions, "ai", { timeout: 70000 });
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
    var _a;
    const code = String((err === null || err === void 0 ? void 0 : err.code) || "").replace(/^functions\//, "");
    const message = String((err === null || err === void 0 ? void 0 : err.message) || "");
    if ((_a = err === null || err === void 0 ? void 0 : err.details) === null || _a === void 0 ? void 0 : _a.credits)
        setCredits(err.details.credits);
    if (code === "unauthenticated" || code === "permission-denied")
        return "Sign in to use Tutor and Generate.";
    if (isApiIssue(code, message))
        return API_ISSUE_MESSAGE;
    if (code === "unavailable")
        return "Couldn't reach Atom Bowl. Check your connection and try again.";
    return message || "Something went wrong. Try again.";
}
async function run(payload) {
    var _a;
    try {
        const result = await callAi(payload);
        setCredits((_a = result.data) === null || _a === void 0 ? void 0 : _a.credits);
        return result.data;
    }
    catch (err) {
        const wrapped = new Error(friendlyError(err));
        wrapped.code = err === null || err === void 0 ? void 0 : err.code;
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