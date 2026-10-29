export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  /** Owner on the latest event; null remains visible as missing data. */
  owner: string | null;
  /** Every valid event for this job, including retries and failures. */
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  /** Most recent supplied error, retained after a later successful event. */
  lastError: string | null;
  /** True when any event failed, even if the job later recovered. */
  hasFailure: boolean;
  /** Original timestamps, with their logged offsets preserved. */
  firstAt: string;
  lastAt: string;
};

export type DigestNight = {
  night: string;
  /** Ascending, case-sensitive job order. */
  rows: DigestRow[];
  /** Invalid JSON or invalid event shapes; blank lines are ignored. */
  badLines: number;
  /** Event counts, not job counts; invalid lines do not contribute. */
  counts: Record<RunStatus, number>;
};

/**
 * Synchronous readNight(runsDir, night), exported from src/digest/reader.ts.
 * Returns null for a missing file or an invalid YYYY-MM-DD night; an empty file
 * returns a DigestNight with no rows. Other filesystem errors propagate.
 * Event chronology uses timestamps, with file order breaking equal-time ties.
 */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
