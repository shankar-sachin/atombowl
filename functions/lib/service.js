// The `ai` endpoint's logic, shared by the Vercel function (api/ai.js, production) and the
// Firebase callable (index.js, local emulators). It checks the caller is a signed-in (not
// anonymous) user, charges daily credits in aiUsage/{uid}, calls the configured model and
// refunds the credits if that call fails. Errors are AiErrors with callable error codes.
import { buildJob } from "./prompts.js";
import { creditState, charge, refund } from "./credits.js";
import { complete, checkModel } from "./providers.js";

export class AiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// The public status page polls `health`, so one provider check per instance per minute is plenty.
const HEALTH_TTL_MS = 60 * 1000;

// config() returns { provider, model, followUpModel, apiKey, dailyCredits }; getDb() returns
// { db, serverTimestamp } and is only called for signed-in actions, so health works without it.
export function createAiService({ config, getDb, logger = console, completeImpl = complete, checkModelImpl = checkModel }) {
  let lastHealth = null;

  async function health() {
    if (lastHealth && Date.now() - lastHealth.at < HEALTH_TTL_MS) return lastHealth.result;
    const { provider, model, followUpModel: followUpSetting, apiKey } = config();
    const followUpModel = followUpSetting || model;
    const started = Date.now();
    const [main, followUp] = await Promise.all([
      checkModelImpl({ provider, model, apiKey }),
      followUpModel === model ? null : checkModelImpl({ provider, model: followUpModel, apiKey })
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

  // auth is { uid, token } from a verified Firebase ID token, or null.
  async function handle(data, auth) {
    if (data?.action === "health") return health();

    if (!auth) throw new AiError("unauthenticated", "Sign in to use Tutor and Generate.");
    if (auth.token?.firebase?.sign_in_provider === "anonymous") {
      throw new AiError("permission-denied", "Create a free account or sign in to use Tutor and Generate.");
    }
    if (auth.token?.firebase?.sign_in_provider === "password" && auth.token?.email_verified !== true) {
      throw new AiError("permission-denied", "Confirm your email to use Tutor and Generate. Open the link we emailed you, or send a new one from your account page.", { reason: "email-unverified" });
    }

    const { provider, model, followUpModel, apiKey, dailyCredits: limit } = config();
    const { db, serverTimestamp } = getDb();
    const usageRef = db.doc(`aiUsage/${auth.uid}`);
    const action = String(data?.action || "");

    if (action === "status") {
      const snap = await usageRef.get();
      return { credits: creditState(snap.data(), limit) };
    }

    let job;
    try {
      job = buildJob(action, data);
    } catch (err) {
      throw new AiError("invalid-argument", err.message);
    }

    const credits = await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const result = charge(snap.data(), job.cost, limit);
      if (!result.ok) {
        const need = job.cost === 1 ? "1 credit" : `${job.cost} credits`;
        throw new AiError("resource-exhausted", `This needs ${need} and you have ${result.state.remaining} left today. Credits reset at midnight UTC.`, { credits: result.state });
      }
      tx.set(usageRef, { ...result.next, updatedAt: serverTimestamp() });
      return result.state;
    });

    const giveBack = (amount) => db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const next = refund(snap.data(), amount);
      if (next) tx.set(usageRef, { ...next, updatedAt: serverTimestamp() });
      return creditState(next || snap.data(), limit);
    }).catch(() => credits);

    try {
      const text = await completeImpl({
        provider,
        model: job.tier === "followup" ? (followUpModel || model) : model,
        apiKey,
        system: job.system,
        messages: job.messages,
        json: job.json,
        maxTokens: job.maxTokens,
        temperature: job.temperature,
        reasoning: job.reasoning
      });
      const result = job.parse(text);
      const unused = job.cost - (job.charged ? job.charged(result) : job.cost);
      if (unused > 0) return { ...result, credits: await giveBack(unused) };
      return { ...result, credits };
    } catch (err) {
      logger.warn("ai call failed", { action, uid: auth.uid, error: err?.message, status: err?.status });
      const restored = await giveBack(job.cost);
      if (err?.status === 429) {
        throw new AiError("resource-exhausted", "The AI service is busy right now. Wait a minute and try again. Your credits were not used.", { credits: restored });
      }
      throw new AiError("unavailable", "The AI service didn't give a usable answer. Try again. Your credits were not used.", { credits: restored });
    }
  }

  return { handle };
}
