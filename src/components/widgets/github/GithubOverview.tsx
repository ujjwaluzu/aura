import type { GithubCalendar, GithubState } from '../../../types/github';

const compactCount = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function GithubOverview({
  calendar,
  account,
}: {
  calendar: GithubCalendar | null;
  account: GithubState['account'];
}) {
  const days = calendar?.weeks.flatMap((week) => week.contributionDays);
  const week = days?.slice(-7);
  const recent = week?.reduce((sum, day) => sum + day.contributionCount, 0);
  const active = days?.filter((day) => day.contributionCount > 0).length;
  const best = days?.reduce(
    (max, day) => Math.max(max, day.contributionCount),
    0,
  );
  const count = (value: number | undefined) =>
    value === undefined
      ? '—'
      : value >= 10_000
        ? compactCount.format(value)
        : value.toLocaleString();
  const peak = Math.max(
    1,
    ...(week?.map((day) => day.contributionCount) ?? []),
  );
  const login = account?.login ?? calendar?.login;

  return (
    <section
      className="glass-surface glass-inset github-overview"
      aria-label="GitHub activity overview"
    >
      <header className="github-overview-heading">
        <span className="github-overview-brand" aria-hidden="true">
          <img src="/icons/github.svg" alt="" width={14} height={14} />
        </span>
        <div className="github-overview-identity">
          <h2>Activity</h2>
          <p
            className="github-overview-login"
            title={login ? `@${login}` : undefined}
          >
            {login ? `@${login}` : 'Your week in code'}
          </p>
        </div>
      </header>
      {days ? (
        <div className="github-overview-data">
          <dl className="github-recent-activity">
            <dt>Last 7 days</dt>
            <dd
              title={`${recent?.toLocaleString()} contributions in the last 7 days`}
            >
              {count(recent)}
            </dd>
          </dl>
          <svg
            className="github-week-trend"
            viewBox="0 0 98 14"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {week?.map((day, index) => {
              const height =
                day.contributionCount > 0
                  ? Math.max(3, (day.contributionCount / peak) * 14)
                  : 2;
              return (
                <rect
                  key={day.date}
                  x={index * 14}
                  y={14 - height}
                  width={10}
                  height={height}
                  rx={2}
                  data-active={day.contributionCount > 0}
                />
              );
            })}
          </svg>
          <dl className="github-overview-stats">
            <div>
              <dt>Active days</dt>
              <dd
                title={`${active?.toLocaleString()} active days in the past year`}
              >
                {count(active)}
              </dd>
            </div>
            <div>
              <dt>Best day</dt>
              <dd
                title={`${best?.toLocaleString()} contributions on the best day in the past year`}
              >
                {count(best)}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="github-overview-empty">
          {account
            ? 'Loading your activity…'
            : 'Connect GitHub to see your week in code.'}
        </p>
      )}
    </section>
  );
}
