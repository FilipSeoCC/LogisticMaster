const assert = require('node:assert/strict');
process.env.INTEGRATION_ENCRYPTION_KEY = 'local-test-key-with-enough-entropy-123456';
const { encrypt, decrypt } = require('../api/_lib/crypto');
const { validateConfig } = require('../api/_lib/imap');

const encrypted = encrypt('mailbox-secret');
assert.notEqual(encrypted, 'mailbox-secret');
assert.ok(!encrypted.includes('mailbox-secret'));
assert.equal(decrypt(encrypted), 'mailbox-secret');
assert.equal(validateConfig({ email: 'test@example.com', password: 'x', host: 'imap.example.com', port: 993 }).folder, 'INBOX');
assert.throws(() => validateConfig({ email: 'bad', password: '', host: 'https://bad' }));

const handler = require('../api/email/messages');
const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(raw) { this.body = JSON.parse(raw); } };
handler({ method: 'GET', headers: {} }, response).then(() => {
  assert.equal(response.statusCode, 401);
  assert.ok(response.body.error);
  console.log('EMAIL_UNIT_OK AUTH_GUARD_OK');
}).catch(error => { console.error(error); process.exit(1); });
