import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

const night = '2026-10-28';

function jobsInTable(html: string): string[] {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((row) => row[1].match(/<td\b[^>]*>([\s\S]*?)<\/td>/)?.[1])
    .filter((cell): cell is string => cell !== undefined)
    .map((cell) => cell.replace(/<[^>]*>/g, ''));
}

describe('digest routes', () => {
  let runsDir: string;
  beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-')); });
  afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

  function app() {
    return createApp({ adapter: 'test', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
  }

  function save(lines: unknown[]) {
    writeFileSync(join(runsDir, `${night}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n'));
  }

  it('serves the same sorted jobs in HTML and JSON, preserving missing owners and logged offsets', async () => {
    save([
      { at: '2026-10-28T23:00:00-04:00', job: 'z/sync', status: 'ok', owner: 'rook' },
      { at: '2026-10-29T00:00:00-04:00', job: 'a/render', status: 'ok', owner: null },
    ]);
    const service = app();
    const page = await service.request(`/digest/${night}`);
    const api = await service.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(api.headers.get('content-type')).toContain('application/json');
    const html = await page.text();
    const data = await api.json() as DigestNight;
    expect(data.rows.map((row) => row.job)).toEqual(['a/render', 'z/sync']);
    expect(jobsInTable(html)).toEqual(data.rows.map((row) => row.job));
    expect(data.rows[0].owner).toBeNull();
    expect(html).toContain('—');
    expect(html).toContain('2026-10-29T00:00:00-04:00');
    expect(html).not.toContain('<script');
  });

  it('returns 404 from both routes when the night has no file', async () => {
    const service = app();
    expect((await service.request(`/digest/${night}`)).status).toBe(404);
    expect((await service.request(`/api/digest/${night}`)).status).toBe(404);
  });

  it('renders an empty night and returns an empty digest', async () => {
    save([]);
    const service = app();
    const page = await service.request(`/digest/${night}`);
    const api = await service.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    const data = await api.json() as DigestNight;
    expect(data.rows).toEqual([]);
    expect(data.badLines).toBe(0);
    expect(data.counts).toEqual({ ok: 0, retry: 0, fail: 0 });
  });

  it('keeps valid rows visible when a line is malformed', async () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), '{"broken":\n' + JSON.stringify({
      at: '2026-10-29T01:00:00+01:00', job: 'kept/job', status: 'ok', owner: null,
    }) + '\n');
    const service = app();
    const page = await service.request(`/digest/${night}`);
    const api = await service.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    const data = await api.json() as DigestNight;
    expect(data.badLines).toBe(1);
    expect(data.rows.map((row) => row.job)).toEqual(['kept/job']);
    expect(jobsInTable(await page.text())).toEqual(['kept/job']);
  });

  it('marks high retries and any failure, even after recovery', async () => {
    save([
      ...[1, 2, 3].map((minute) => ({ at: `2026-10-29T01:0${minute}:00+01:00`, job: 'retry/job', status: 'retry', owner: 'rook', error: 'upstream 503' })),
      { at: '2026-10-29T01:04:00+01:00', job: 'retry/job', status: 'ok', owner: 'rook' },
      { at: '2026-10-29T02:00:00+01:00', job: 'failed/job', status: 'fail', owner: 'lane-07', error: 'quota exceeded' },
      { at: '2026-10-29T02:01:00+01:00', job: 'failed/job', status: 'ok', owner: 'lane-07' },
    ]);
    const service = app();
    const html = await (await service.request(`/digest/${night}`)).text();
    const data = await (await service.request(`/api/digest/${night}`)).json() as DigestNight;
    expect(data.rows.find((row) => row.job === 'retry/job')?.retries).toBe(3);
    expect(data.rows.find((row) => row.job === 'failed/job')?.hasFailure).toBe(true);
    for (const job of ['failed/job', 'retry/job']) {
      const row = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].find((match) => match[0].includes(job));
      expect(row?.[0]).toContain('warn');
    }
    expect(html).toContain('quota exceeded');
    expect(html).toContain('upstream 503');
  });
});
