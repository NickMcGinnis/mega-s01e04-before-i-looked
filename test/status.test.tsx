import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('links each night to its digest and shows event counts', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html).toContain('· ok 10 · retry 4 · fail 1');
    expect(html).toContain('· ok 7 · retry 0 · fail 0');
  });

  it('shows the empty state when the runs directory is missing', async () => {
    const runsDir = join(mkdtempSync(join(tmpdir(), 'rig-status-')), 'missing-runs');
    try {
      const res = await createApp({ ...config, runsDir }).request('/');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('nothing in runs/');
      expect(html).not.toContain('/digest/');
    } finally {
      rmSync(join(runsDir, '..'), { recursive: true, force: true });
    }
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
