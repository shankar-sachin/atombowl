// Production `ai` endpoint on Vercel's free plan (https://atombowl-ai.vercel.app/api/ai).
// Firebase Hosting, Auth and Firestore stay on Firebase's free plan; only this server code
// lives here, because Cloud Functions need the paid Blaze plan.
// Vercel environment variables:
//   AI_API_KEY                the provider key (secret)
//   FIREBASE_SERVICE_ACCOUNT  a service account key's JSON, for verifying sign-ins and the
//                             aiUsage credits in Firestore (secret)
//   AI_PROVIDER, AI_MODEL, AI_FOLLOWUP_MODEL, AI_DAILY_CREDITS  optional, defaults below
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createAiService, AiError } from "../lib/service.js";
import { corsHeaders, bearerToken, errorResponse } from "../lib/http.js";

const PROJECT_ID = "nsbatombowl";

function adminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
  return initializeApp({ credential: cert(JSON.parse(raw)), projectId: PROJECT_ID });
}

const service = createAiService({
  config: () => ({
    provider: process.env.AI_PROVIDER || "groq",
    model: process.env.AI_MODEL || "openai/gpt-oss-120b",
    followUpModel: process.env.AI_FOLLOWUP_MODEL ?? "openai/gpt-oss-20b",
    apiKey: process.env.AI_API_KEY || "",
    dailyCredits: parseInt(process.env.AI_DAILY_CREDITS || "30", 10) || 30
  }),
  getDb: () => ({ db: getFirestore(adminApp()), serverTimestamp: () => FieldValue.serverTimestamp() })
});

async function verifiedAuth(req) {
  const token = bearerToken(req.headers.authorization);
  if (!token) return null;
  try {
    const decoded = await getAuth(adminApp()).verifyIdToken(token);
    return { uid: decoded.uid, token: decoded };
  } catch (err) {
    if (/FIREBASE_SERVICE_ACCOUNT/.test(err?.message)) throw err;
    throw new AiError("unauthenticated", "Your sign-in expired. Sign in again to use Tutor and Generate.");
  }
}

export default async function handler(req, res) {
  for (const [key, value] of Object.entries(corsHeaders(req.headers.origin))) res.setHeader(key, value);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: { status: "INVALID_ARGUMENT", message: "Use POST." } });

  try {
    const data = req.body?.data ?? null;
    const auth = data?.action === "health" ? null : await verifiedAuth(req);
    const result = await service.handle(data, auth);
    return res.status(200).json({ result });
  } catch (err) {
    if (!(err instanceof AiError)) console.error("ai request failed", err);
    const { status, body } = errorResponse(err);
    return res.status(status).json(body);
  }
}
