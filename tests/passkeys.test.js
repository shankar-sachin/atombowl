const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const lib = (name) => import(`../functions/lib/${name}.js`);

const ORIGIN = 'https://atombowl.web.app';
const RP_ID = 'atombowl.web.app';

// ---- A software authenticator: a real P-256 key and real WebAuthn messages ----
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function cbor(value) {
  const head = (major, n) => (n < 24 ? Buffer.from([(major << 5) | n]) : n < 256 ? Buffer.from([(major << 5) | 24, n]) : Buffer.from([(major << 5) | 25, n >> 8, n & 255]));
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') { const t = Buffer.from(value); return Buffer.concat([head(3, t.length), t]); }
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  const entries = Object.entries(value instanceof Map ? Object.fromEntries(value) : value);
  return Buffer.concat([head(5, entries.length), ...entries.flatMap(([k, v]) => [cbor(/^-?\d+$/.test(k) ? Number(k) : k), cbor(v)])]);
}
function authenticator(rpID = RP_ID) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialId = crypto.randomBytes(32);
  const rpIdHash = crypto.createHash('sha256').update(rpID).digest();
  const counter = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const clientData = (type, challenge, origin) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  let signCount = 0;
  return {
    id: b64u(credentialId),
    register(options, origin = ORIGIN) {
      const cose = cbor({ 1: 2, 3: -7, '-1': 1, '-2': Buffer.from(jwk.x, 'base64url'), '-3': Buffer.from(jwk.y, 'base64url') });
      const credLen = Buffer.alloc(2); credLen.writeUInt16BE(credentialId.length);
      const authData = Buffer.concat([rpIdHash, Buffer.from([0x45]), counter(0), Buffer.alloc(16), credLen, credentialId, cose]);
      return {
        id: b64u(credentialId), rawId: b64u(credentialId), type: 'public-key', clientExtensionResults: {}, authenticatorAttachment: 'platform',
        response: {
          clientDataJSON: b64u(clientData('webauthn.create', options.challenge, origin)),
          attestationObject: b64u(cbor({ fmt: 'none', attStmt: {}, authData })),
          transports: ['internal']
        }
      };
    },
    login(options, { origin = ORIGIN, count } = {}) {
      signCount = count ?? signCount + 1;
      const authData = Buffer.concat([rpIdHash, Buffer.from([0x05]), counter(signCount)]);
      const clientDataJSON = clientData('webauthn.get', options.challenge, origin);
      const signature = crypto.sign('sha256', Buffer.concat([authData, crypto.createHash('sha256').update(clientDataJSON).digest()]), privateKey);
      return {
        id: b64u(credentialId), rawId: b64u(credentialId), type: 'public-key', clientExtensionResults: {},
        response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(signature), userHandle: b64u(Buffer.from('u1')) }
      };
    }
  };
}

// ---- A tiny in-memory Firestore ----
function fakeDb() {
  const data = new Map();
  const ref = (col, id) => ({
    get: async () => ({ exists: data.has(`${col}/${id}`), id, data: () => data.get(`${col}/${id}`) }),
    set: async (value) => { data.set(`${col}/${id}`, { ...value }); },
    update: async (value) => { data.set(`${col}/${id}`, { ...data.get(`${col}/${id}`), ...value }); },
    delete: async () => { data.delete(`${col}/${id}`); }
  });
  const query = (col, test, max = Infinity) => ({
    limit: (n) => query(col, test, n),
    get: async () => ({ docs: [...data].filter(([k, v]) => k.startsWith(`${col}/`) && test(v)).slice(0, max).map(([k, v]) => ({ id: k.slice(col.length + 1), data: () => v })) })
  });
  return {
    data,
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, v) => r.set(v), delete: (r) => r.delete() }),
    collection: (col) => ({
      doc: (id) => ref(col, id),
      where: (field, op, value) => query(col, (v) => (op === '<' ? v[field] < value : v[field] === value))
    })
  };
}

async function setup() {
  const { createPasskeyService } = await lib('passkeys');
  const db = fakeDb();
  let clock = 1_000_000;
  const tokens = [];
  const service = createPasskeyService({
    config: () => ({ origins: [ORIGIN] }),
    getDb: () => ({ db }),
    createToken: async (uid) => { tokens.push(uid); return `token-for-${uid}`; },
    now: () => clock
  });
  const user = (extra = {}) => ({ uid: 'u1', token: { email: 'ann@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...extra } });
  const act = (action, data, auth = null, origin = ORIGIN) => service.handle({ action, ...data }, auth, { origin });
  return { service, db, act, user, tokens, tick: (ms) => { clock += ms; } };
}

async function addPasskey(t, device = authenticator(), name = 'My phone') {
  const { options } = await t.act('register-options', {}, t.user());
  const out = await t.act('register-verify', { response: device.register(options), name }, t.user());
  return { device, out };
}

test('a passkey can be added, then used to sign in, and the counter moves forward', async () => {
  const t = await setup();
  const { options } = await t.act('register-options', {}, t.user());
  assert.equal(options.rp.id, RP_ID);
  assert.equal(options.authenticatorSelection.residentKey, 'required');
  assert.equal(options.authenticatorSelection.userVerification, 'required');
  const device = authenticator();
  const added = await t.act('register-verify', { response: device.register(options), name: '  My   phone ' }, t.user());
  assert.equal(added.passkey.name, 'My phone');
  assert.equal(t.db.data.get(`passkeys/${device.id}`).uid, 'u1');
  assert.equal(t.db.data.size, 1, 'the used challenge is gone');

  const login = await t.act('login-options', {});
  assert.equal(login.options.allowCredentials, undefined);
  const result = await t.act('login-verify', { response: device.login(login.options) });
  assert.equal(result.token, 'token-for-u1');
  assert.deepEqual(t.tokens, ['u1']);
  assert.equal(t.db.data.get(`passkeys/${device.id}`).counter, 1);
  assert.equal(t.db.data.get(`passkeys/${device.id}`).lastUsedAt, 1_000_000);
});

test('a login response works once, and only for the challenge it was made for', async () => {
  const t = await setup();
  const { device } = await addPasskey(t);
  const { options } = await t.act('login-options', {});
  const response = device.login(options);
  await t.act('login-verify', { response });
  await assert.rejects(t.act('login-verify', { response }), (e) => e.code === 'permission-denied');
  // A challenge the server never issued.
  const forged = device.login({ challenge: b64u(crypto.randomBytes(32)) });
  await assert.rejects(t.act('login-verify', { response: forged }), (e) => e.code === 'permission-denied');
});

test('challenges expire after five minutes', async () => {
  const t = await setup();
  const { device } = await addPasskey(t);
  const { options } = await t.act('login-options', {});
  t.tick(5 * 60 * 1000 + 1);
  await assert.rejects(t.act('login-verify', { response: device.login(options) }), (e) => e.code === 'permission-denied');
});

test('a replayed or cloned authenticator (counter not increasing) is refused', async () => {
  const t = await setup();
  const { device } = await addPasskey(t);
  const first = await t.act('login-options', {});
  await t.act('login-verify', { response: device.login(first.options, { count: 5 }) });
  const second = await t.act('login-options', {});
  await assert.rejects(t.act('login-verify', { response: device.login(second.options, { count: 5 }) }), (e) => e.code === 'permission-denied');
  assert.equal(t.tokens.length, 1);
});

test('only the official site origin may use passkeys, and responses must match it', async () => {
  const t = await setup();
  await assert.rejects(t.act('login-options', {}, null, 'https://evil.example'), (e) => e.code === 'permission-denied');
  await assert.rejects(t.act('register-options', {}, t.user(), 'http://localhost:5055'), (e) => e.code === 'permission-denied');
  const { device } = await addPasskey(t);
  const { options } = await t.act('login-options', {});
  // Signed for another origin: the browser would never send this, but the server must not accept it.
  await assert.rejects(t.act('login-verify', { response: device.login(options, { origin: 'https://evil.example' }) }), (e) => e.code === 'permission-denied');
});

test('an unknown passkey is refused with a hint to add it first', async () => {
  const t = await setup();
  const stranger = authenticator();
  const { options } = await t.act('login-options', {});
  await assert.rejects(t.act('login-verify', { response: stranger.login(options) }), (e) => e.code === 'permission-denied' && /isn't registered/.test(e.message));
});

test('guests and unconfirmed email accounts cannot add passkeys', async () => {
  const t = await setup();
  await assert.rejects(t.act('register-options', {}, null), (e) => e.code === 'unauthenticated');
  await assert.rejects(t.act('register-options', {}, t.user({ firebase: { sign_in_provider: 'anonymous' } })), (e) => e.code === 'permission-denied');
  await assert.rejects(t.act('register-options', {}, t.user({ email_verified: false, firebase: { sign_in_provider: 'password' } })), (e) => e.code === 'permission-denied' && e.details?.reason === 'email-unverified');
  await t.act('register-options', {}, t.user({ email_verified: true, firebase: { sign_in_provider: 'password' } }));
});

test('a registration for someone else, or the same passkey twice, is refused', async () => {
  const t = await setup();
  const { options } = await t.act('register-options', {}, t.user());
  const device = authenticator();
  await assert.rejects(t.act('register-verify', { response: device.register(options) }, { ...t.user(), uid: 'u2' }), (e) => e.code === 'permission-denied');
  const again = await t.act('register-options', {}, t.user());
  await t.act('register-verify', { response: device.register(again.options) }, t.user());
  const third = await t.act('register-options', {}, t.user());
  assert.deepEqual(third.options.excludeCredentials.map((c) => c.id), [device.id]);
  await assert.rejects(t.act('register-verify', { response: device.register(third.options) }, t.user()), (e) => e.code === 'invalid-argument');
});

test('passkeys can be listed and removed by their owner only, with a cap of ten', async () => {
  const t = await setup();
  const a = await addPasskey(t, authenticator(), 'Laptop');
  await addPasskey(t, authenticator(), 'Phone');
  const list = await t.act('list', {}, t.user());
  assert.deepEqual(list.passkeys.map((p) => p.name), ['Laptop', 'Phone']);
  assert.deepEqual(Object.keys(list.passkeys[0]).sort(), ['createdAt', 'id', 'lastUsedAt', 'name']);
  assert.deepEqual((await t.act('list', {}, { ...t.user(), uid: 'u2' })).passkeys, []);
  await assert.rejects(t.act('remove', { id: a.device.id }, { ...t.user(), uid: 'u2' }), (e) => e.code === 'not-found');
  await t.act('remove', { id: a.device.id }, t.user());
  assert.equal((await t.act('list', {}, t.user())).passkeys.length, 1);
  for (let i = 0; i < 9; i += 1) await addPasskey(t, authenticator(), `Key ${i}`);
  await assert.rejects(t.act('register-options', {}, t.user()), (e) => e.code === 'resource-exhausted');
});

test('junk input is rejected cleanly', async () => {
  const t = await setup();
  await assert.rejects(t.act('nope', {}, t.user()), (e) => e.code === 'invalid-argument');
  await assert.rejects(t.act('login-verify', { response: { id: 'x', response: { clientDataJSON: 'not-json' } } }), (e) => e.code === 'invalid-argument');
  await assert.rejects(t.act('login-verify', {}), (e) => e.code === 'invalid-argument');
});

test('unanswered challenges are cleared once they expire, and a mismatched request leaves a live one alone', async () => {
  const t = await setup();
  const count = () => [...t.db.data.keys()].filter((k) => k.startsWith('passkeyChallenges/')).length;
  for (let i = 0; i < 5; i += 1) await t.act('login-options', {});
  assert.equal(count(), 5);
  t.tick(6 * 60 * 1000);
  await t.act('login-options', {});
  assert.equal(count(), 1);

  // A registration response that names a login challenge is refused, and the login challenge survives.
  const { options } = await t.act('login-options', {});
  const clientDataJSON = Buffer.from(JSON.stringify({ challenge: options.challenge })).toString('base64url');
  await assert.rejects(t.act('register-verify', { response: { response: { clientDataJSON } } }, t.user()), (e) => e.code === 'permission-denied');
  assert.ok(t.db.data.has(`passkeyChallenges/${options.challenge}`));
});
