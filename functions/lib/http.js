// The Firebase callable protocol over plain HTTP, so the site's httpsCallableFromURL client can
// talk to the Vercel function: POST {data} with "Authorization: Bearer <ID token>", and
// {result} or {error: {status, message, details}} back.

const SITE_ORIGINS = ["https://atombowl.web.app", "https://nsbatombowl.firebaseapp.com"];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const HTTP_STATUS = {
  "invalid-argument": 400,
  "unauthenticated": 401,
  "permission-denied": 403,
  "not-found": 404,
  "resource-exhausted": 429,
  "internal": 500,
  "unavailable": 503,
  "deadline-exceeded": 504
};

export function allowedOrigin(origin) {
  return SITE_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(String(origin || ""));
}

export function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Firebase-Instance-ID-Token, X-Firebase-AppCheck, X-Firebase-GMPID",
    "Access-Control-Max-Age": "3600",
    "Vary": "Origin"
  };
  if (allowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function bearerToken(header) {
  const match = /^Bearer\s+(.+)$/i.exec(String(header || ""));
  return match ? match[1].trim() : "";
}

// Turns a thrown error into the callable error body. Anything that isn't an AiError is
// reported as a bare "internal", like Firebase does, so server details never leak.
export function errorResponse(err) {
  const known = Boolean(HTTP_STATUS[err?.code]);
  const code = known ? err.code : "internal";
  const error = {
    status: code.toUpperCase().replace(/-/g, "_"),
    message: known ? String(err.message || code) : "INTERNAL"
  };
  if (known && err.details !== undefined) error.details = err.details;
  return { status: HTTP_STATUS[code], body: { error } };
}
