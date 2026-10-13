import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregatePool, parsePoolResponse } from '../dist/pool-usage.js';
import { renderPoolLines } from '../dist/render/rate-limits-line.js';

// Shape returned by the mini seat shim GET /usage (2026-10-12).
const body = JSON.stringify({
  fetched_at: 1791850754,
  seats: [
    {
      seat: 1,
      limits: [
        { kind: 'session', percent: 10, resets_at: '2026-10-13T05:00:00+00:00' },
        {
          kind: 'weekly_scoped',
          percent: 40,
          resets_at: '2026-10-15T06:00:00+00:00',
          model: 'Fable',
        },
      ],
    },
    {
      seat: 2,
      limits: [
        { kind: 'session', percent: 30, resets_at: '2026-10-13T04:50:00+00:00' },
        {
          kind: 'weekly_scoped',
          percent: 0,
          resets_at: '2026-10-13T08:00:00+00:00',
          model: 'Fable',
        },
      ],
    },
    { seat: 3, error: 'refresh rejected (invalid_grant) - seat needs re-login', limits: [] },
  ],
});

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const strip = (s) => s.replace(ANSI, '');

test('aggregatePool averages per-seat limits and keeps the earliest reset', () => {
  const pool = aggregatePool(parsePoolResponse(body), 1000);
  assert.equal(pool.seatsOk, 2);
  assert.equal(pool.seatsTotal, 3);
  assert.deepEqual(
    pool.windows.map((w) => w.label),
    ['pool 5h', 'pool fable'],
  );
  assert.equal(pool.windows[0].avgPct, 20);
  assert.equal(pool.windows[0].maxPct, 30);
  assert.equal(pool.windows[0].resetsAt, '2026-10-13T04:50:00+00:00');
  assert.equal(pool.windows[1].avgPct, 20);
  assert.equal(pool.errors.length, 1);
  assert.match(pool.errors[0], /^s3: refresh rejected/);
});

test('renderPoolLines shows pool windows with seat count', () => {
  const pool = aggregatePool(parsePoolResponse(body), 1000);
  const out = strip(renderPoolLines({ poolUsage: pool }));
  const lines = out.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^pool 5h\s.*20%.*peak 30%.*2\/3 seats$/);
  assert.match(lines[1], /^pool fable\s.*20%.*peak 40%$/);
});

test('renderPoolLines marks a cache older than 15 minutes as stale', () => {
  const pool = aggregatePool(parsePoolResponse(body), 20 * 60_000);
  assert.match(strip(renderPoolLines({ poolUsage: pool })), /stale 20m/);
});

test('renderPoolLines reports unavailable when no seat answered', () => {
  const rows = parsePoolResponse(
    JSON.stringify({ seats: [{ seat: 1, error: 'usage HTTP 429', limits: [] }] }),
  );
  assert.equal(
    strip(renderPoolLines({ poolUsage: aggregatePool(rows, 0) })),
    'pool       unavailable (0/1 seats)',
  );
});

test('parsePoolResponse rejects bodies that are not the shim shape', () => {
  assert.equal(parsePoolResponse('not json'), null);
  assert.equal(parsePoolResponse('{"error":"not found"}'), null);
  assert.equal(parsePoolResponse('{"seats":[]}'), null);
  assert.equal(parsePoolResponse('{"seats":[{"seat":"one"}]}'), null);
});

test('renderPoolLines renders nothing without pool data', () => {
  assert.equal(renderPoolLines({ poolUsage: null }), null);
  assert.equal(renderPoolLines({}), null);
});
