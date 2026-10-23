// The `ai` callable for the local Firebase emulators. Production runs the same logic on
// Vercel (api/ai.js), because deploying Cloud Functions needs the paid Blaze plan.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString, defineInt } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createAiService, AiError } from "./lib/service.js";

initializeApp();
const db = getFirestore();

const AI_API_KEY = defineSecret("AI_API_KEY");
const AI_PROVIDER = defineString("AI_PROVIDER", { default: "groq" });
const AI_MODEL = defineString("AI_MODEL", { default: "openai/gpt-oss-120b" });
// Tutor follow-ups in a chat use this smaller model; empty means AI_MODEL.
const AI_FOLLOWUP_MODEL = defineString("AI_FOLLOWUP_MODEL", { default: "" });
const AI_DAILY_CREDITS = defineInt("AI_DAILY_CREDITS", { default: 30 });

const service = createAiService({
  config: () => ({
    provider: AI_PROVIDER.value(),
    model: AI_MODEL.value(),
    followUpModel: AI_FOLLOWUP_MODEL.value(),
    apiKey: AI_API_KEY.value(),
    dailyCredits: AI_DAILY_CREDITS.value()
  }),
  getDb: () => ({ db, serverTimestamp: () => FieldValue.serverTimestamp() }),
  logger
});

export const ai = onCall({
  secrets: [AI_API_KEY],
  region: "us-central1",
  memory: "256MiB",
  timeoutSeconds: 60,
  maxInstances: 10
}, async (request) => {
  try {
    return await service.handle(request.data, request.auth);
  } catch (err) {
    if (err instanceof AiError) throw new HttpsError(err.code, err.message, err.details);
    throw err;
  }
});
