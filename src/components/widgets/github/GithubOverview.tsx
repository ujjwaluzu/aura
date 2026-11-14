import type { GithubCalendar } from '../../../types/github';

export function GithubOverview({
  calendar,
}: {
  calendar: GithubCalendar | null;
}) {
  const days = calendar?.weeks.flatMap((week) => week.contributionDays);
  const recent = days
    ?.slice(-7)
    .reduce((sum, day) => sum + day.contributionCount, 0);
  const active = days?.filter((day) => day.contributionCount > 0).length;
  const best = days?.reduce(
    (max, day) => Math.max(max, day.contributionCount),
    0,
  );
  const count = (value: number | undefined) => value?.toLocaleString() ?? '—';

  return (
    <section className="github-overview" aria-label="GitHub activity overview">
      <div className="github-overview-brand">
        <img src="/icons/github.svg" alt="GitHub" width={16} height={16} />
      </div>
      <h2 title={calendar ? `@${calendar.login}` : undefined}>
        {calendar ? `@${calendar.login}` : 'Your activity'}
      </h2>
      {days ? (
        <dl>
          <div className="github-recent-activity">
            <dt>Last 7 days</dt>
            <dd>{count(recent)}</dd>
          </div>
          <div className="github-overview-stats">
            <div>
              <dt>Active days</dt>
              <dd>{count(active)}</dd>
            </div>
            <div>
              <dt>Best day</dt>
              <dd>{count(best)}</dd>
            </div>
          </div>
        </dl>
      ) : (
        <p className="github-overview-empty">
          Your week in code.
          <br />
          Connect to see your activity at a glance.
        </p>
      )}
    </section>
  );
}
