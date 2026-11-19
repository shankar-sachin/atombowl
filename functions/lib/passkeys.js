// Passkey sign-in. Firebase's web SDK has no passkeys, so this verifies the WebAuthn ceremony
// itself (with @simplewebauthn/server) and, on a good login, mints a Firebase custom token that
// the page exchanges with signInWithCustomToken.
//
// Firestore (server-only; the rules give clients no access to either collection):
//   passkeyChallenges/{challenge}  { type, uid|null, origin, expiresAt }   single use, 5 minutes
//   passkeys/{credentialId}        { uid, publicKey, counter, transports, name, deviceType,
//                                    backedUp, createdAt, lastUsedAt }
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from "@simplewebauthn/server";
import { AiError } from "./service.js";

export const MAX_PASSKEYS = 10;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RP_NAME = "Atom Bowl";

const b64u = {
  encode: (bytes) => Buffer.from(bytes).toString("base64url"),
  decode: (text) => new Uint8Array(Buffer.from(String(text), "base64url"))
};

const defaultLib = { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse };

// config() returns { origins }, the exact site origins that may use passkeys. The relying-party id
// is each origin's hostname, so a passkey only works on the address it was created on.
// getDb() returns { db }. createToken(uid) returns a Firebase custom token, or throws an AiError
// when the account no longer exists or is disabled.
export function createPasskeyService({ config, getDb, createToken, lib = defaultLib, now = () => Date.now() }) {
  const challenges = (db) => db.collection("passkeyChallenges");
  const passkeys = (db) => db.collection("passkeys");

  function originFor(origin) {
    if (!config().origins.includes(origin)) {
      throw new AiError("permission-denied", "Passkeys only work on the official Atom Bowl site.");
    }
    return { origin, rpID: new URL(origin).hostname };
  }

  async function saveChallenge(db, challenge, fields) {
    await challenges(db).doc(challenge).set({ ...fields, expiresAt: now() + CHALLENGE_TTL_MS });
  }

  // The challenge is inside the browser's clientDataJSON. Read it, and consume the stored copy so
  // a response can be used once only.
  async function takeChallenge(db, response, type, origin, uid) {
    let challenge;
    try {
      challenge = JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8")).challenge;
    } catch {
      challenge = null;
    }
    if (typeof challenge !== "string" || !challenge || challenge.includes("/")) {
      throw new AiError("invalid-argument", "That passkey response is not valid.");
    }
    const ref = challenges(db).doc(challenge);
    const snap = await ref.get();
    const doc = snap.exists ? snap.data() : null;
    if (doc) await ref.delete();
    if (!doc || doc.type !== type || doc.origin !== origin || doc.uid !== uid || doc.expiresAt < now()) {
      throw new AiError("permission-denied", "That passkey request expired. Try again.");
    }
    return challenge;
  }

  function requireAccount(auth) {
    if (!auth) throw new AiError("unauthenticated", "Sign in first.");
    const provider = auth.token?.firebase?.sign_in_provider;
    if (provider === "anonymous") throw new AiError("permission-denied", "Create a free account or sign in before adding a passkey.");
    // A passkey signs in without the email check, so unconfirmed email accounts can't add one.
    if (provider === "password" && auth.token?.email_verified !== true) {
      throw new AiError("permission-denied", "Confirm your email before adding a passkey.", { reason: "email-unverified" });
    }
    return auth.uid;
  }

  const cleanName = (value) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || "Passkey";

  async function ownPasskeys(db, uid) {
    const snap = await passkeys(db).where("uid", "==", uid).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async function handle(data, auth, { origin } = {}) {
    const action = String(data?.action || "");
    const { db } = getDb();

    if (action === "register-options") {
      const uid = requireAccount(auth);
      const site = originFor(origin);
      const existing = await ownPasskeys(db, uid);
      if (existing.length >= MAX_PASSKEYS) throw new AiError("resource-exhausted", `You can have up to ${MAX_PASSKEYS} passkeys. Remove one first.`);
      const userName = String(auth.token?.email || uid);
      const options = await lib.generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: site.rpID,
        userName,
        userDisplayName: String(auth.token?.name || userName),
        userID: new TextEncoder().encode(uid),
        attestationType: "none",
        excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports || undefined })),
        authenticatorSelection: { residentKey: "required", userVerification: "required" }
      });
      await saveChallenge(db, options.challenge, { type: "register", uid, origin: site.origin });
      return { options };
    }

    if (action === "register-verify") {
      const uid = requireAccount(auth);
      const site = originFor(origin);
      const response = data?.response;
      const expectedChallenge = await takeChallenge(db, response, "register", site.origin, uid);
      let verification;
      try {
        verification = await lib.verifyRegistrationResponse({
          response,
          expectedChallenge,
          expectedOrigin: site.origin,
          expectedRPID: site.rpID,
          requireUserVerification: true
        });
      } catch {
        throw new AiError("invalid-argument", "That passkey could not be verified.");
      }
      if (!verification.verified) throw new AiError("invalid-argument", "That passkey could not be verified.");
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      const doc = passkeys(db).doc(credential.id);
      if ((await doc.get()).exists) throw new AiError("invalid-argument", "That passkey is already registered.");
      const time = now();
      await doc.set({
        uid,
        publicKey: b64u.encode(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || null,
        name: cleanName(data?.name),
        deviceType: credentialDeviceType,
        backedUp: !!credentialBackedUp,
        createdAt: time,
        lastUsedAt: null
      });
      return { passkey: { id: credential.id, name: cleanName(data?.name), createdAt: time, lastUsedAt: null } };
    }

    if (action === "login-options") {
      const site = originFor(origin);
      // No allowCredentials: the passkey itself tells us who is signing in.
      const options = await lib.generateAuthenticationOptions({ rpID: site.rpID, userVerification: "required" });
      await saveChallenge(db, options.challenge, { type: "login", uid: null, origin: site.origin });
      return { options };
    }

    if (action === "login-verify") {
      const site = originFor(origin);
      const response = data?.response;
      const expectedChallenge = await takeChallenge(db, response, "login", site.origin, null);
      const id = String(response?.id || "");
      if (!id || id.includes("/")) throw new AiError("invalid-argument", "That passkey response is not valid.");
      const ref = passkeys(db).doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new AiError("permission-denied", "That passkey isn't registered with Atom Bowl. Sign in another way, then add it on the Account page.");
      const stored = snap.data();
      let verification;
      try {
        verification = await lib.verifyAuthenticationResponse({
          response,
          expectedChallenge,
          expectedOrigin: site.origin,
          expectedRPID: site.rpID,
          requireUserVerification: true,
          credential: { id, publicKey: b64u.decode(stored.publicKey), counter: stored.counter || 0, transports: stored.transports || undefined }
        });
      } catch {
        throw new AiError("permission-denied", "That passkey could not be verified.");
      }
      if (!verification.verified) throw new AiError("permission-denied", "That passkey could not be verified.");
      const token = await createToken(stored.uid);
      await ref.update({ counter: verification.authenticationInfo.newCounter, lastUsedAt: now() });
      return { token };
    }

    if (action === "list") {
      const uid = requireAccountForManage(auth);
      const items = await ownPasskeys(db, uid);
      return { passkeys: items.sort((a, b) => a.createdAt - b.createdAt).map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt || null })) };
    }

    if (action === "remove") {
      const uid = requireAccountForManage(auth);
      const id = String(data?.id || "");
      if (!id || id.includes("/")) throw new AiError("invalid-argument", "Pick a passkey to remove.");
      const ref = passkeys(db).doc(id);
      const snap = await ref.get();
      if (!snap.exists || snap.data().uid !== uid) throw new AiError("not-found", "That passkey was not found.");
      await ref.delete();
      return { removed: id };
    }

    throw new AiError("invalid-argument", "Unknown action.");
  }

  // Listing and removing only need a signed-in, non-guest account.
  function requireAccountForManage(auth) {
    if (!auth) throw new AiError("unauthenticated", "Sign in first.");
    if (auth.token?.firebase?.sign_in_provider === "anonymous") throw new AiError("permission-denied", "Sign in to manage passkeys.");
    return auth.uid;
  }

  return { handle };
}
