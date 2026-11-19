// @ts-nocheck
// Passkeys in the browser: the WebAuthn ceremony, plus calls to functions/api/passkey.js (Vercel).
// Loaded on demand by account.ts and account_store.ts. Passkeys are tied to one web address, so they
// only work on PASSKEY_HOST; everywhere else the page hides the buttons.
import { app } from "./firebase.js";
import { getFunctions, httpsCallableFromURL } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-functions.js";

export const PASSKEY_URL = "https://atombowl-ai.vercel.app/api/passkey";
export const PASSKEY_HOST = "atombowl.web.app";

const call = httpsCallableFromURL(getFunctions(app, "us-central1"), PASSKEY_URL, { timeout: 30000 });

async function send(payload) {
  const result = await call(payload);
  return result.data;
}

export function passkeysAvailable() {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials && location.hostname === PASSKEY_HOST;
}

const toBytes = (text) => {
  const base64 = String(text).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(text).length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};
const toText = (buffer) => {
  let binary = "";
  new Uint8Array(buffer).forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// The server speaks JSON with base64url strings; the browser wants ArrayBuffers.
function creationOptions(json) {
  return {
    ...json,
    challenge: toBytes(json.challenge),
    user: { ...json.user, id: toBytes(json.user.id) },
    excludeCredentials: (json.excludeCredentials || []).map((c) => ({ ...c, id: toBytes(c.id) }))
  };
}

function requestOptions(json) {
  return { ...json, challenge: toBytes(json.challenge), allowCredentials: (json.allowCredentials || []).map((c) => ({ ...c, id: toBytes(c.id) })) };
}

function attestationJson(credential) {
  return {
    id: credential.id,
    rawId: toText(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || undefined,
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
    response: {
      clientDataJSON: toText(credential.response.clientDataJSON),
      attestationObject: toText(credential.response.attestationObject),
      transports: credential.response.getTransports?.() || []
    }
  };
}

function assertionJson(credential) {
  const { response } = credential;
  return {
    id: credential.id,
    rawId: toText(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || undefined,
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
    response: {
      clientDataJSON: toText(response.clientDataJSON),
      authenticatorData: toText(response.authenticatorData),
      signature: toText(response.signature),
      userHandle: response.userHandle ? toText(response.userHandle) : undefined
    }
  };
}

// Adds a passkey to the signed-in account.
export async function registerPasskey(name) {
  const { options } = await send({ action: "register-options" });
  const credential = await navigator.credentials.create({ publicKey: creationOptions(options) });
  if (!credential) throw new Error("No passkey was created.");
  const { passkey } = await send({ action: "register-verify", response: attestationJson(credential), name });
  return passkey;
}

// Asks the browser for a passkey and returns the Firebase custom token the server minted for it.
export async function loginWithPasskey() {
  const { options } = await send({ action: "login-options" });
  const credential = await navigator.credentials.get({ publicKey: requestOptions(options) });
  if (!credential) throw new Error("No passkey was chosen.");
  const { token } = await send({ action: "login-verify", response: assertionJson(credential) });
  return token;
}

export async function listPasskeys() {
  return (await send({ action: "list" })).passkeys || [];
}

export function removePasskey(id) {
  return send({ action: "remove", id });
}
