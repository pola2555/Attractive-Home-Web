import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, tooManyMessage } from './rate-limit';

const uniq = (p: string) => `${p}:${Math.random().toString(36).slice(2)}`;

test('allows up to the limit, then denies with a retry hint', () => {
  const key = uniq('t');
  const scope = [{ key, limit: 5, windowMs: 60_000 }];
  for (let i = 0; i < 5; i++) assert.equal(rateLimit(scope).ok, true, `attempt ${i + 1}`);
  const denied = rateLimit(scope);
  assert.equal(denied.ok, false);
  assert.ok(denied.retryAfterMs > 0 && denied.retryAfterMs <= 60_000);
});

test('distinct keys are throttled independently', () => {
  const a = uniq('a');
  const b = uniq('b');
  for (let i = 0; i < 3; i++) rateLimit([{ key: a, limit: 3, windowMs: 60_000 }]);
  assert.equal(rateLimit([{ key: a, limit: 3, windowMs: 60_000 }]).ok, false);
  assert.equal(rateLimit([{ key: b, limit: 3, windowMs: 60_000 }]).ok, true);
});

test('a denied multi-scope call does not consume budget in the passing scope', () => {
  const tight = uniq('tight');
  const loose = uniq('loose');
  rateLimit([{ key: tight, limit: 1, windowMs: 60_000 }]); // exhaust tight
  const r = rateLimit([
    { key: tight, limit: 1, windowMs: 60_000 },
    { key: loose, limit: 1, windowMs: 60_000 },
  ]);
  assert.equal(r.ok, false, 'tight scope denies the whole call');
  // loose must still have its single allowance (it was not consumed)
  assert.equal(rateLimit([{ key: loose, limit: 1, windowMs: 60_000 }]).ok, true);
});

test('tooManyMessage gives a human wait hint', () => {
  assert.match(tooManyMessage(20_000), /wait a minute/i);
  assert.match(tooManyMessage(5 * 60_000), /5 minutes/);
});
