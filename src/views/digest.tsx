import type { DigestNight, DigestRow } from '../digest/types.js';

export function DigestPage({ digest }: { digest: DigestNight }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      <p>
        {digest.badLines > 0 ? <span class="warn">{digest.badLines} bad line{digest.badLines === 1 ? '' : 's'} skipped</span> : <span class="mute">no bad lines</span>}
      </p>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first time</th>
              <th>last time</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <tr>
                <td>{row.job}</td>
                <td>{row.owner ?? '—'}</td>
                <td>{row.runs}</td>
                <td class={row.retries >= 3 ? 'warn' : undefined}>{row.retries}</td>
                <td class={row.hasFailure || row.lastStatus === 'fail' ? 'warn' : undefined}>
                  {row.lastStatus}{row.hasFailure ? ' · failure' : ''}
                </td>
                <td class={row.lastError ? 'warn' : undefined}>{row.lastError ?? '—'}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
