import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isNight(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return match !== null
    && isNight(match[1])
    && Number(match[2]) < 24
    && Number(match[3]) < 60
    && Number(match[4]) < 60
    && (match[5] === undefined || (Number(match[5]) < 24 && Number(match[6]) < 60))
    && Number.isFinite(Date.parse(value));
}

function isRunEvent(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return isTimestamp(event.at)
    && typeof event.job === 'string' && event.job.trim().length > 0
    && (event.status === 'ok' || event.status === 'retry' || event.status === 'fail')
    && (event.owner === null || typeof event.owner === 'string')
    && (!('error' in event) || typeof event.error === 'string');
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const events: RunEvent[] = [];
  let badLines = 0;
  for (const line of contents.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    try {
      const value: unknown = JSON.parse(line);
      if (isRunEvent(value)) events.push(value);
      else badLines++;
    } catch {
      badLines++;
    }
  }

  // Stable sorting preserves file order for simultaneous events.
  events.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const rows = new Map<string, DigestRow>();
  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  for (const event of events) {
    counts[event.status]++;
    let row = rows.get(event.job);
    if (row === undefined) {
      row = {
        job: event.job,
        owner: event.owner,
        runs: 0,
        retries: 0,
        lastStatus: event.status,
        lastError: null,
        hasFailure: false,
        firstAt: event.at,
        lastAt: event.at,
      };
      rows.set(event.job, row);
    }
    row.runs++;
    if (event.status === 'retry') row.retries++;
    if (event.status === 'fail') row.hasFailure = true;
    row.owner = event.owner;
    row.lastStatus = event.status;
    if (event.error !== undefined) row.lastError = event.error;
    row.lastAt = event.at;
  }

  return {
    night,
    rows: [...rows.values()].sort((left, right) => left.job < right.job ? -1 : left.job > right.job ? 1 : 0),
    badLines,
    counts,
  };
};
