// Atom Bowl's only server code: the `ai` callable behind Tutor and Generate.
// It checks the caller is a signed-in (not anonymous) user, charges daily credits in
// aiUsage/{uid}, calls the configured model and refunds the credits if that call fails.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString, defineInt } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { buildJob } from "./lib/prompts.js";
import { creditState, charge, refund } from "./lib/credits.js";
import { complete, checkModel } from "./lib/providers.js";

initializeApp();
const db = getFirestore();

const AI_API_KEY = defineSecret("AI_API_KEY");
const AI_PROVIDER = defineString("AI_PROVIDER", { default: "groq" });
const AI_MODEL = defineString("AI_MODEL", { default: "openai/gpt-oss-120b" });
// Tutor follow-ups in a chat use this smaller model; empty means AI_MODEL.
const AI_FOLLOWUP_MODEL = defineString("AI_FOLLOWUP_MODEL", { default: "" });
const AI_DAILY_CREDITS = defineInt("AI_DAILY_CREDITS", { default: 30 });

// The public status page polls `health`, so one provider check per instance per minute is plenty.
const HEALTH_TTL_MS = 60 * 1000;
let lastHealth = null;

async function health() {
  if (lastHealth && Date.now() - lastHealth.at < HEALTH_TTL_MS) return lastHealth.result;
  const provider = AI_PROVIDER.value();
  const model = AI_MODEL.value();
  const followUpModel = AI_FOLLOWUP_MODEL.value() || model;
  const apiKey = AI_API_KEY.value();
  const started = Date.now();
  const [main, followUp] = await Promise.all([
    checkModel({ provider, model, apiKey }),
    followUpModel === model ? null : checkModel({ provider, model: followUpModel, apiKey })
  ]);
  const followUpCheck = followUp || main;
  const ok = main.ok && followUpCheck.ok;
  if (!ok) logger.warn("ai health check failed", { provider, model, followUpModel, main, followUp });
  const result = {
    ok,
    provider,
    model,
    followUpModel,
    models: {
      main: { id: model, ...main },
      followUp: { id: followUpModel, ...followUpCheck }
    },
    latencyMs: Date.now() - started,
    checkedAt: new Date().toISOString()
  };
  lastHealth = { at: Date.now(), result };
  return result;
}

export const ai = onCall({
  secrets: [AI_API_KEY],
  region: "us-central1",
  memory: "256MiB",
  timeoutSeconds: 60,
  maxInstances: 10
}, async (request) => {
  if (request.data?.action === "health") return health();

  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in to use Tutor and Generate.");
  if (auth.token?.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("permission-denied", "Create a free account or sign in to use Tutor and Generate.");
  }

  const limit = AI_DAILY_CREDITS.value();
  const usageRef = db.doc(`aiUsage/${auth.uid}`);
  const action = String(request.data?.action || "");

  if (action === "status") {
    const snap = await usageRef.get();
    return { credits: creditState(snap.data(), limit) };
  }

  let job;
  try {
    job = buildJob(action, request.data);
  } catch (err) {
    throw new HttpsError("invalid-argument", err.message);
  }

  const credits = await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const result = charge(snap.data(), job.cost, limit);
    if (!result.ok) {
      const need = job.cost === 1 ? "1 credit" : `${job.cost} credits`;
      throw new HttpsError("resource-exhausted", `This needs ${need} and you have ${result.state.remaining} left today. Credits reset at midnight UTC.`, { credits: result.state });
    }
    tx.set(usageRef, { ...result.next, updatedAt: FieldValue.serverTimestamp() });
    return result.state;
  });

  try {
    const text = await complete({
      provider: AI_PROVIDER.value(),
      model: job.tier === "followup" ? (AI_FOLLOWUP_MODEL.value() || AI_MODEL.value()) : AI_MODEL.value(),
      apiKey: AI_API_KEY.value(),
      system: job.system,
      messages: job.messages,
      json: job.json,
      maxTokens: job.maxTokens,
      temperature: job.temperature,
      reasoning: job.reasoning
    });
    const result = job.parse(text);
    const unused = job.cost - (job.charged ? job.charged(result) : job.cost);
    if (unused > 0) {
      const settled = await db.runTransaction(async (tx) => {
        const snap = await tx.get(usageRef);
        const next = refund(snap.data(), unused);
        if (next) tx.set(usageRef, { ...next, updatedAt: FieldValue.serverTimestamp() });
        return creditState(next || snap.data(), limit);
      }).catch(() => credits);
      return { ...result, credits: settled };
    }
    return { ...result, credits };
  } catch (err) {
    logger.warn("ai call failed", { action, uid: auth.uid, error: err?.message, status: err?.status });
    const restored = await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const next = refund(snap.data(), job.cost);
      if (next) tx.set(usageRef, { ...next, updatedAt: FieldValue.serverTimestamp() });
      return creditState(next || snap.data(), limit);
    }).catch(() => credits);
    if (err?.status === 429) {
      throw new HttpsError("resource-exhausted", "The AI service is busy right now. Wait a minute and try again. Your credits were not used.", { credits: restored });
    }
    throw new HttpsError("unavailable", "The AI service didn't give a usable answer. Try again. Your credits were not used.", { credits: restored });
  }
});
