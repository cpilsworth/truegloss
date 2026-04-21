import { test } from 'node:test';
import assert from 'node:assert/strict';

const { handleBooking } = await import('../src/index.mjs');

const validBody = () => ({
  name: 'Jane Doe',
  phone: '+441234567890',
  email: 'jane@example.com',
  preferredDate: '2026-05-01',
  note: 'Paint correction on BMW',
});

const makeEnv = () => {
  const sent = [];
  return {
    env: {
      BOOKING_SENDER_DOMAIN: 'truegloss.uk',
      BOOKING_EMAIL: {
        send: async (msg) => { sent.push(msg); },
      },
    },
    sent,
  };
};

const postRequest = (body) => new Request('https://www.truegloss.uk/api/booking', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('rejects non-POST', async () => {
  const { env } = makeEnv();
  const req = new Request('https://www.truegloss.uk/api/booking', { method: 'GET' });
  const res = await handleBooking(req, env);
  assert.equal(res.status, 405);
});

test('rejects invalid JSON', async () => {
  const { env } = makeEnv();
  const res = await handleBooking(postRequest('not-json'), env);
  assert.equal(res.status, 400);
});

test('rejects missing required fields', async () => {
  const { env } = makeEnv();
  const body = validBody();
  delete body.phone;
  const res = await handleBooking(postRequest(body), env);
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.match(json.error, /phone/);
});

test('rejects invalid email', async () => {
  const { env } = makeEnv();
  const body = validBody();
  body.email = 'not-an-email';
  const res = await handleBooking(postRequest(body), env);
  assert.equal(res.status, 400);
});

test('sends email on valid submission', async () => {
  const { env, sent } = makeEnv();
  const res = await handleBooking(postRequest(validBody()), env);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'cpilsworth+truegloss@gmail.com');
  assert.match(sent[0].from, /bookings@truegloss\.uk/);
  const raw = sent[0].raw;
  assert.match(raw, /Jane Doe/);
  assert.match(raw, /jane@example\.com/);
  assert.match(raw, /2026-05-01/);
  assert.match(raw, /Paint correction on BMW/);
  assert.match(raw, /Reply-To:.*<jane@example\.com>/i);
});

test('escapes HTML in note field', async () => {
  const { env, sent } = makeEnv();
  const body = validBody();
  body.note = '<script>alert(1)</script>';
  await handleBooking(postRequest(body), env);
  const raw = sent[0].raw;
  // raw is MIME — the HTML part is base64/qp encoded, so decode-agnostic:
  // assert the literal <script> tag does not appear in the HTML part source.
  // We check the unencoded plain-text part contains the note as-is, and the
  // html part does not contain a raw <script>.
  const htmlPart = raw.split('Content-Type: text/html')[1] || '';
  assert.ok(!/<script>/.test(htmlPart), 'raw <script> leaked into HTML part');
  assert.ok(/&lt;script&gt;/.test(htmlPart), 'expected escaped script tag');
});

test('returns 500 when email binding missing', async () => {
  const res = await handleBooking(postRequest(validBody()), {});
  assert.equal(res.status, 500);
});

test('returns 502 when email send throws', async () => {
  const env = {
    BOOKING_EMAIL: {
      send: async () => { throw new Error('boom'); },
    },
  };
  const res = await handleBooking(postRequest(validBody()), env);
  assert.equal(res.status, 502);
});
