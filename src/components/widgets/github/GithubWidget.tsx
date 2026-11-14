import { useRef, useState, type KeyboardEvent } from 'react';
import {
  GitBranch,
  MoreHorizontal,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { GlassSurface } from '../../ui/GlassSurface';
import {
  githubConnect,
  githubCancel,
  githubRefresh,
  githubDisconnect,
  githubOpen,
} from '../../../features/integrations/github';
import type { useGithub } from '../../../hooks/useGithub';
import type { ContributionDay, GithubCalendar } from '../../../types/github';

const formatDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
const describe = (day: ContributionDay) =>
  `${day.contributionCount} contribution${day.contributionCount === 1 ? '' : 's'} on ${formatDate(day.date)}`;
const months = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  timeZone: 'UTC',
});

function Calendar({ calendar }: { calendar: GithubCalendar }) {
  const days = calendar.weeks.flatMap((w) => w.contributionDays);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selected = days.find((d) => d.date === selectedDate) ?? days.at(-1)!;
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const move = (event: KeyboardEvent, day: ContributionDay) => {
    const delta = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[
      event.key
    ];
    let index = days.findIndex((d) => d.date === day.date);
    if (delta !== undefined)
      index = Math.min(days.length - 1, Math.max(0, index + delta));
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = days.length - 1;
    else return;
    event.preventDefault();
    const target = days[index];
    if (!target) return;
    setSelectedDate(target.date);
    buttons.current.get(target.date)?.focus();
  };
  return (
    <>
      <div
        className="github-calendar"
        role="group"
        aria-label="Past year contribution calendar. Use arrow keys to explore days."
        style={{
          gridTemplateColumns: `repeat(${calendar.weeks.length}, minmax(0, 1fr))`,
        }}
      >
        {calendar.weeks.map((week, index) => {
          const first = week.contributionDays[0];
          if (!first) return null;
          const monthStart = week.contributionDays.find((d) =>
            d.date.endsWith('-01'),
          );
          const label =
            monthStart ??
            (index === 0 && Number(first.date.slice(8)) < 22
              ? first
              : undefined);
          return (
            <div className="github-week" key={first.date}>
              <span className="github-month" aria-hidden="true">
                {label
                  ? months.format(new Date(`${label.date}T00:00:00Z`))
                  : ''}
              </span>
              {week.contributionDays.map((day) => (
                <button
                  key={day.date}
                  ref={(node) => {
                    if (node) buttons.current.set(day.date, node);
                    else buttons.current.delete(day.date);
                  }}
                  type="button"
                  className="github-day"
                  data-level={day.contributionLevel}
                  style={{ gridRow: day.weekday + 2 }}
                  aria-label={describe(day)}
                  title={describe(day)}
                  tabIndex={selected.date === day.date ? 0 : -1}
                  onFocus={() => setSelectedDate(day.date)}
                  onMouseEnter={() => setSelectedDate(day.date)}
                  onKeyDown={(event) => move(event, day)}
                />
              ))}
            </div>
          );
        })}
      </div>
      <p className="github-day-detail" aria-live="polite">
        {describe(selected)}
      </p>
    </>
  );
}

export function GithubWidget({
  github,
}: {
  github: ReturnType<typeof useGithub>;
}) {
  const { state, error, run } = github;
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const code = state.authorization?.userCode;
  const connecting =
    state.status === 'requesting' || state.status === 'authorizing';
  const act = async (fn: Parameters<typeof run>[0]) => {
    setBusy(true);
    try {
      await run(fn);
    } finally {
      setBusy(false);
    }
  };
  const copy = () =>
    run(async () => {
      await navigator.clipboard.writeText(code!);
      setCopied(true);
    });
  return (
    <section className="github-slot" aria-label="GitHub connection">
      <GlassSurface variant="inset" opacity={0.35} className="github-card">
        <header className="github-header">
          <span>
            <GitBranch size={14} />{' '}
            {state.calendar
              ? `@${state.calendar.login}`
              : 'GitHub contributions'}
          </span>
          <div className="github-actions">
            {state.calendar && state.status === 'reconnectRequired' && (
              <button
                type="button"
                className="github-reconnect"
                aria-label="Reconnect GitHub"
                onClick={() => void act(githubConnect)}
              >
                Reconnect
              </button>
            )}
            {(state.status === 'connected' || state.calendar) && (
              <>
                <button
                  type="button"
                  aria-label="Refresh GitHub contributions"
                  title="Refresh contributions"
                  disabled={
                    busy || state.refreshing || state.status !== 'connected'
                  }
                  onClick={() => void act(() => githubRefresh())}
                >
                  <RefreshCw
                    size={13}
                    className={state.refreshing ? 'github-spinning' : undefined}
                  />
                </button>
                <button
                  type="button"
                  aria-label="Open GitHub profile"
                  title="Open profile"
                  onClick={() => void run(() => githubOpen('profile'))}
                >
                  <ExternalLink size={13} />
                </button>
              </>
            )}
            <div
              className="github-account"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setMenu(false);
              }}
            >
              <button
                type="button"
                aria-label="GitHub account menu"
                aria-expanded={menu}
                aria-controls="github-account-actions"
                onClick={() => setMenu(!menu)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setMenu(false);
                }}
              >
                <MoreHorizontal size={16} />
              </button>
              {menu && (
                <div
                  id="github-account-actions"
                  className="github-menu"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setMenu(false);
                      (
                        e.currentTarget
                          .previousElementSibling as HTMLButtonElement
                      )?.focus();
                    }
                  }}
                >
                  <button
                    type="button"
                    disabled={!state.configured}
                    onClick={() => {
                      setMenu(false);
                      void run(() => githubOpen('authorization'));
                    }}
                  >
                    Manage GitHub authorization
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      void act(githubDisconnect);
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {state.calendar && (
          <div className="github-calendar-content">
            <p className="github-total">
              <strong>
                {state.calendar.totalContributions.toLocaleString()}
              </strong>{' '}
              contributions in the past year
            </p>
            <Calendar
              key={state.calendar.accountId}
              calendar={state.calendar}
            />
            <div className="github-update">
              <span>
                Last updated{' '}
                {new Date(state.calendar.updatedAt * 1000).toLocaleTimeString(
                  undefined,
                  { hour: '2-digit', minute: '2-digit' },
                )}
                {state.stale ? ' · Stale' : ''}
                {state.refreshing ? ' · Updating' : ''}
              </span>
              <span
                className="github-legend"
                aria-label="Less to more contributions"
              >
                Less <i data-level="NONE" />
                <i data-level="FIRST_QUARTILE" />
                <i data-level="SECOND_QUARTILE" />
                <i data-level="THIRD_QUARTILE" />
                <i data-level="FOURTH_QUARTILE" /> More
              </span>
            </div>
          </div>
        )}
        {connecting ? (
          <div className="github-onboarding">
            {code ? (
              <>
                <p>Enter this code on GitHub</p>
                <strong className="github-code">{code}</strong>
                <div className="github-connect-actions">
                  <button type="button" onClick={() => void copy()}>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void run(() => githubOpen('verification'))}
                  >
                    Open GitHub
                  </button>
                  <button type="button" onClick={() => void act(githubCancel)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>Requesting a GitHub verification code…</p>
                <button type="button" onClick={() => void act(githubCancel)}>
                  Cancel
                </button>
              </>
            )}
          </div>
        ) : state.status !== 'connected' && !state.calendar ? (
          <div className="github-onboarding">
            <button
              type="button"
              className="github-connect-button"
              disabled={busy}
              onClick={() => void act(githubConnect)}
            >
              {state.status === 'reconnectRequired'
                ? 'Reconnect GitHub'
                : 'Connect GitHub'}
            </button>
            {!state.calendar && (
              <p>Public and permitted private contribution counts.</p>
            )}
          </div>
        ) : !state.calendar ? (
          <p className="github-loading" role="status">
            {state.message
              ? 'Waiting to load contributions…'
              : 'Loading contributions…'}
          </p>
        ) : null}
        {(error || state.message) && (
          <p
            className="github-message"
            role="status"
            title={error ?? state.message ?? undefined}
          >
            {error ?? state.message}
          </p>
        )}
        <p
          className="github-footnote"
          title="Aura reflects GitHub’s recorded public and permitted private counts. Qualifying commits can take up to 24 hours to appear on GitHub; refreshes cannot guarantee instant updates after a push."
        >
          GitHub’s recorded counts · Refreshes every 5 min · Commits may take
          24h
        </p>
      </GlassSurface>
    </section>
  );
}
