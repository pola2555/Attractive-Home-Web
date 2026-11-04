import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, rateLimitPeek, rateLimitRecord, tooManyMessage } from './rate-limit';

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

test('rateLimitPeek checks without consuming budget', () => {
  const key = uniq('peek');
  const scope = [{ key, limit: 2, windowMs: 60_000 }];
  // Peeking any number of times never consumes the allowance.
  for (let i = 0; i < 10; i++) assert.equal(rateLimitPeek(scope).ok, true, `peek ${i + 1}`);
  // ...so both real allowances are still available.
  assert.equal(rateLimit(scope).ok, true);
  assert.equal(rateLimit(scope).ok, true);
  assert.equal(rateLimit(scope).ok, false);
});

test('rateLimitRecord consumes without checking, and peek then sees the limit', () => {
  const key = uniq('rec');
  const scope = [{ key, limit: 3, windowMs: 60_000 }];
  rateLimitRecord(scope);
  rateLimitRecord(scope);
  assert.equal(rateLimitPeek(scope).ok, true, 'two hits is under the limit of 3');
  rateLimitRecord(scope);
  const denied = rateLimitPeek(scope);
  assert.equal(denied.ok, false, 'third hit reaches the limit');
  assert.ok(denied.retryAfterMs > 0 && denied.retryAfterMs <= 60_000);
});

test('peek-to-gate + record-on-failure: only failures count toward lockout', () => {
  // Models signInCustomer: gate with peek, record only when the attempt fails.
  const key = uniq('login');
  const scope = [{ key, limit: 3, windowMs: 60_000 }];
  const attempt = (fails: boolean): boolean => {
    if (!rateLimitPeek(scope).ok) return false; // gated
    if (fails) rateLimitRecord(scope);
    return true;
  };
  // Many SUCCESSFUL logins in a row are never gated.
  for (let i = 0; i < 20; i++) assert.equal(attempt(false), true, `success ${i + 1}`);
  // Failures accumulate: the 4th failed attempt is locked out.
  assert.equal(attempt(true), true);
  assert.equal(attempt(true), true);
  assert.equal(attempt(true), true);
  assert.equal(attempt(true), false, 'locked out after hitting the failure limit');
});

test('tooManyMessage gives a human wait hint', () => {
  assert.match(tooManyMessage(20_000), /wait a minute/i);
  assert.match(tooManyMessage(5 * 60_000), /5 minutes/);
});
