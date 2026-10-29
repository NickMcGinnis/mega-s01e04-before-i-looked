import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('night reader', () => {
  let runsDir: string;
  const night = '2026-10-28';

  beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-reader-')); });
  afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

  function writeEvents(events: unknown[]) {
    writeFileSync(join(runsDir, `${night}.jsonl`), events.map((event) => JSON.stringify(event)).join('\n'));
  }

  it('reads the real night without changing its five jobs or swallowing the bad line', () => {
    const digest = readNight(new URL('../runs', import.meta.url).pathname, night);
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.badLines).toBe(1);
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest?.rows[0]).toMatchObject({ owner: null, runs: 1, lastError: null });
    expect(digest?.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
      lastStatus: 'ok', lastError: 'upstream 503', hasFailure: false,
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(digest?.rows[2]).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held' });
    expect(digest?.rows[3]).toMatchObject({ lastStatus: 'fail', hasFailure: true, lastError: 'quota exceeded' });
  });

  it('distinguishes a missing night from an empty one', () => {
    expect(readNight(runsDir, night)).toBeNull();
    writeFileSync(join(runsDir, `${night}.jsonl`), '\n \r\n');
    expect(readNight(runsDir, night)).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts malformed JSON and invalid event shapes while keeping the valid row', () => {
    const valid = { at: '2026-10-28T23:00:00+01:00', job: 'one', status: 'ok', owner: null };
    writeEvents([
      null, [], 12, {},
      { ...valid, status: 'unknown' }, { ...valid, owner: 7 },
      { ...valid, owner: undefined }, { ...valid, error: {} }, { ...valid, job: ' ' },
      { ...valid, at: '2026-02-30T23:00:00+01:00' },
      { ...valid, at: '2026-10-28T24:00:00+01:00' },
      { ...valid, at: '2026-10-28T23:00:00' },
      valid,
    ]);
    const file = join(runsDir, `${night}.jsonl`);
    // A truncated last record must not prevent rendering everything before it.
    const { rows, badLines, counts } = readNight(runsDir, night)!;
    expect(rows).toHaveLength(1);
    expect(badLines).toBe(12);
    expect(counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    writeFileSync(file, `${JSON.stringify(valid)}\r\n{truncated`);
    expect(readNight(runsDir, night)).toMatchObject({ badLines: 1, counts: { ok: 1, retry: 0, fail: 0 } });
  });

  it('uses chronological instants and retains offsets, failures, and the latest supplied error', () => {
    writeEvents([
      { at: '2026-10-29T00:00:00Z', job: '__proto__', status: 'ok', owner: null },
      { at: '2026-10-29T01:30:00+02:00', job: '__proto__', status: 'retry', owner: 'second', error: 'second error' },
      { at: '2026-10-28T18:00:00-05:00', job: '__proto__', status: 'fail', owner: 'first', error: 'first error' },
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: '__proto__', owner: null, runs: 3, retries: 1, lastStatus: 'ok',
      lastError: 'second error', hasFailure: true,
      firstAt: '2026-10-28T18:00:00-05:00', lastAt: '2026-10-29T00:00:00Z',
    }]);
  });

  it('breaks equal timestamp ties by file order and sorts jobs predictably', () => {
    writeEvents([
      { at: '2026-10-28T23:00:00Z', job: 'z', status: 'fail', owner: 'old', error: 'failed' },
      { at: '2026-10-28T23:00:00Z', job: 'A', status: 'ok', owner: null },
      { at: '2026-10-28T23:00:00Z', job: 'z', status: 'ok', owner: 'new' },
    ]);
    const rows = readNight(runsDir, night)?.rows;
    expect(rows?.map((row) => row.job)).toEqual(['A', 'z']);
    expect(rows?.[1]).toMatchObject({ owner: 'new', lastStatus: 'ok', hasFailure: true });
  });

  it('rejects traversal and impossible dates and propagates non-missing filesystem errors', () => {
    for (const invalid of ['../2026-10-28', '2026-02-29', '2026-13-01', '2026-1-01']) {
      expect(readNight(runsDir, invalid)).toBeNull();
    }
    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow();
  });
});
