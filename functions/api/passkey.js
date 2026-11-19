// Passkey sign-in endpoint on Vercel (https://atombowl-ai.vercel.app/api/passkey). Same callable
// protocol and environment as api/ai.js. Optional: PASSKEY_ORIGINS, a comma-separated list of site
// origins that may use passkeys (default https://atombowl.web.app).
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { AiError } from "../lib/service.js";
import { createPasskeyService } from "../lib/passkeys.js";
import { corsHeaders, bearerToken, errorResponse } from "../lib/http.js";

const PROJECT_ID = "nsbatombowl";

function adminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
  return initializeApp({ credential: cert(JSON.parse(raw)), projectId: PROJECT_ID });
}

const service = createPasskeyService({
  config: () => ({
    origins: (process.env.PASSKEY_ORIGINS || "https://atombowl.web.app").split(",").map((s) => s.trim()).filter(Boolean)
  }),
  getDb: () => ({ db: getFirestore(adminApp()) }),
  createToken: async (uid) => {
    const auth = getAuth(adminApp());
    let user;
    try {
      user = await auth.getUser(uid);
    } catch {
      throw new AiError("permission-denied", "That account no longer exists.");
    }
    if (user.disabled) throw new AiError("permission-denied", "That account is disabled.");
    return auth.createCustomToken(uid);
  }
});

async function verifiedAuth(req) {
  const token = bearerToken(req.headers.authorization);
  if (!token) return null;
  try {
    const decoded = await getAuth(adminApp()).verifyIdToken(token);
    return { uid: decoded.uid, token: decoded };
  } catch (err) {
    if (/FIREBASE_SERVICE_ACCOUNT/.test(err?.message)) throw err;
    throw new AiError("unauthenticated", "Your sign-in expired. Sign in again.");
  }
}

// Sign-in itself has no ID token yet, so only the actions that act on an account need one.
const PUBLIC_ACTIONS = new Set(["login-options", "login-verify"]);

export default async function handler(req, res) {
  for (const [key, value] of Object.entries(corsHeaders(req.headers.origin))) res.setHeader(key, value);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: { status: "INVALID_ARGUMENT", message: "Use POST." } });

  try {
    const data = req.body?.data ?? null;
    const auth = PUBLIC_ACTIONS.has(data?.action) ? null : await verifiedAuth(req);
    const result = await service.handle(data, auth, { origin: req.headers.origin });
    return res.status(200).json({ result });
  } catch (err) {
    if (!(err instanceof AiError)) console.error("passkey request failed", err);
    const { status, body } = errorResponse(err);
    return res.status(status).json(body);
  }
}
