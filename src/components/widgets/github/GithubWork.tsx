import { useState, type ReactNode } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  ExternalLink,
  GitPullRequest,
  HelpCircle,
  LockKeyhole,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { GlassSurface } from '../../ui/GlassSurface';
import { DialogPanel } from '../../ui/DialogPanel';
import {
  GithubAccountMenu,
  GithubAuthorization,
  type GithubController,
} from './GithubControls';
import {
  githubWorkOpen,
  githubWorkRefresh,
} from '../../../features/integrations/github';
import type { GithubWorkCategory, GithubWorkItem } from '../../../types/github';

const workCategories: { id: GithubWorkCategory; label: string }[] = [
  { id: 'reviews', label: 'Reviews' },
  { id: 'myPrs', label: 'My PRs' },
  { id: 'failingPrs', label: 'Failing PRs' },
  { id: 'issues', label: 'Issues' },
];
const compactCount = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});
function age(updated: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(updated)) / 60000),
  );
  return minutes < 1
    ? 'just now'
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : `${Math.floor(minutes / 1440)}d ago`;
}
function checkStatus(checks: string | null) {
  switch (checks) {
    case 'SUCCESS':
      return {
        label: 'Passing',
        description: 'Checks passing',
        tone: 'positive',
        Icon: CheckCircle2,
      };
    case 'FAILURE':
    case 'ERROR':
      return {
        label: 'Failing',
        description: 'Checks failing',
        tone: 'negative',
        Icon: XCircle,
      };
    case 'PENDING':
    case 'EXPECTED':
      return {
        label: 'Pending',
        description:
          checks === 'EXPECTED' ? 'Checks expected' : 'Checks pending',
        tone: 'pending',
        Icon: Clock3,
      };
    default:
      return {
        label: 'Unknown',
        description: 'Checks unknown',
        tone: 'muted',
        Icon: HelpCircle,
      };
  }
}
function reviewStatus(item: GithubWorkItem) {
  if (item.draft) return 'Draft';
  return (
    {
      APPROVED: 'Approved',
      CHANGES_REQUESTED: 'Changes requested',
      REVIEW_REQUIRED: 'Review required',
    } as Record<string, string>
  )[item.reviewDecision ?? ''];
}
function WorkRow({
  item,
  category,
  open,
}: {
  item: GithubWorkItem;
  category: GithubWorkCategory;
  open: () => void;
}) {
  const issue = category === 'issues';
  const checks = checkStatus(item.checks);
  const review = reviewStatus(item);
  const ItemIcon = issue ? CircleDot : GitPullRequest;
  return (
    <button
      className="github-work-row"
      type="button"
      title={item.title}
      onClick={open}
    >
      <ItemIcon
        size={14}
        className="github-work-item-icon"
        aria-hidden="true"
      />
      <strong className="github-work-title">{item.title}</strong>
      <time
        className="github-work-age"
        dateTime={item.updatedAt}
        title={new Date(item.updatedAt).toLocaleString()}
      >
        {age(item.updatedAt)}
      </time>
      <span className="github-work-meta">
        <span
          className="github-work-repository"
          title={`${item.repository} #${item.number}${item.private ? ' · Private' : ''}`}
        >
          <span className="github-work-repository-name">{item.repository}</span>
          <span className="github-work-number">#{item.number}</span>
          {item.private && (
            <>
              <LockKeyhole size={10} aria-hidden="true" />
              <span className="sr-only">Private</span>
            </>
          )}
        </span>
        <span className="github-work-statuses">
          {issue ? (
            <span className="github-work-review">Assigned</span>
          ) : (
            <>
              {review && (
                <span className="github-work-review" title={review}>
                  {review}
                </span>
              )}
              <span
                className="github-work-checks"
                data-tone={checks.tone}
                title={checks.description}
              >
                <checks.Icon size={11} aria-hidden="true" />
                <span>
                  <span className="sr-only">Checks </span>
                  {checks.label.toLowerCase()}
                </span>
              </span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}
export function GithubWork({
  github,
  navigation,
  category,
  select,
}: {
  github: GithubController;
  navigation: ReactNode;
  category: GithubWorkCategory;
  select: (category: GithubWorkCategory) => void;
}) {
  const { state, error, run } = github;
  const [pages, setPages] = useState<
    Partial<Record<GithubWorkCategory, number>>
  >({});
  const [details, setDetails] = useState(false);
  const cache = state.work.find((c) => c.category === category);
  const maxPage = Math.max(0, Math.ceil((cache?.items.length ?? 0) / 3) - 1);
  const page = Math.min(pages[category] ?? 0, maxPage);
  const items = cache?.items.slice(page * 3, page * 3 + 3) ?? [];
  const connecting =
    state.status === 'requesting' || state.status === 'authorizing';
  const permission = !state.workPermission || cache?.status === 'permission';
  const refreshing = state.work.some((c) => c.loading);
  const message =
    error ??
    cache?.message ??
    (connecting || permission ? state.message : null);
  const updated = cache?.updatedAt
    ? new Date(cache.updatedAt * 1000).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
  const refresh = () => run(() => githubWorkRefresh());
  const selectPage = (next: number) =>
    setPages((previous) => ({ ...previous, [category]: next }));
  const next = async () => {
    selectPage(page + 1);
    if (page >= maxPage)
      await run(() => githubWorkRefresh(false, category, true));
  };
  return (
    <>
      <div className="primary-slot github-work-sidebar">
        <section
          className="github-work-overview"
          aria-label="GitHub Work categories"
        >
          <h2>Work</h2>
          <div className="github-work-tiles">
            {workCategories.map(({ id, label }) => {
              const c = state.work.find((entry) => entry.category === id);
              const compact = c?.count != null && c.count >= 10000;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={category === id}
                  onClick={() => select(id)}
                  title={`${label}: ${c?.count?.toLocaleString() ?? 'unavailable'}${c?.stale ? ' · Stale' : ''}`}
                >
                  <span>{label}</span>
                  <strong>
                    {c?.count == null
                      ? '—'
                      : compact
                        ? compactCount.format(c.count)
                        : c.count.toLocaleString()}
                  </strong>
                  <span className="sr-only">
                    {c?.count == null
                      ? 'unavailable'
                      : `${compact ? `(${c.count.toLocaleString()})` : ''}${c.stale ? ' stale' : ''}`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        {navigation}
      </div>
      <div className="widget-divider" aria-hidden="true" />
      <section
        className="github-slot github-work-slot"
        aria-label="GitHub Work"
      >
        <GlassSurface
          variant="inset"
          opacity={0.35}
          className="github-card github-work-card"
        >
          <header className="github-header">
            <div className="github-work-heading">
              <h3>{workCategories.find((c) => c.id === category)?.label}</h3>
              <span
                className="github-work-account"
                title={`@${state.account?.login}`}
              >
                @{state.account?.login}
              </span>
            </div>
            <div className="github-actions">
              {(message || cache?.stale) && (
                <button
                  type="button"
                  className="github-work-health"
                  aria-label="Show Work status"
                  aria-haspopup="dialog"
                  aria-expanded={details}
                  title={
                    message ?? 'Showing cached Work data. Refresh to update.'
                  }
                  onClick={() => setDetails(true)}
                >
                  <AlertCircle size={12} />
                  <span>
                    {cache?.stale ? 'Stale' : permission ? 'Access' : 'Error'}
                  </span>
                </button>
              )}
              <button
                type="button"
                aria-label="Refresh GitHub Work"
                title={refreshing ? 'Refreshing Work…' : 'Refresh Work'}
                disabled={connecting || !state.workPermission || refreshing}
                onClick={() => void refresh()}
              >
                <RefreshCw
                  size={13}
                  className={refreshing ? 'github-spinning' : undefined}
                />
              </button>
              <GithubAccountMenu github={github} />
            </div>
          </header>
          {connecting || permission ? (
            <GithubAuthorization github={github} upgrade />
          ) : (
            <>
              <div
                className="github-work-list"
                aria-busy={cache?.loading ?? false}
              >
                {items.map((item) => (
                  <WorkRow
                    key={item.id}
                    item={item}
                    category={category}
                    open={() =>
                      void run(() => githubWorkOpen(category, item.id))
                    }
                  />
                ))}
                {!items.length && (
                  <div className="github-work-empty" role="status">
                    {cache?.count === 0 && cache.status === 'empty' ? (
                      <>
                        <CheckCircle2 size={22} aria-hidden="true" />
                        <p>You’re all caught up.</p>
                        <small>
                          No{' '}
                          {category === 'issues'
                            ? 'assigned issues'
                            : category === 'reviews'
                              ? 'review requests'
                              : category === 'failingPrs'
                                ? 'failing pull requests'
                                : 'open pull requests'}{' '}
                          right now.
                        </small>
                      </>
                    ) : cache?.loading ||
                      cache?.status === 'loading' ||
                      !cache ? (
                      <>
                        <RefreshCw
                          size={20}
                          className="github-spinning"
                          aria-hidden="true"
                        />
                        <p>Loading Work…</p>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={22} aria-hidden="true" />
                        <p>Work is unavailable. Refresh to retry.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
              <footer className="github-work-footer">
                <div
                  className="github-work-pagination"
                  aria-label="Work result pages"
                >
                  <button
                    type="button"
                    aria-label="Previous Work results"
                    disabled={page === 0}
                    onClick={() => selectPage(page - 1)}
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <span aria-live="polite">
                    {items.length
                      ? `${page * 3 + 1}–${page * 3 + items.length}`
                      : '0'}{' '}
                    / {cache?.count?.toLocaleString() ?? '—'}
                  </span>
                  <button
                    type="button"
                    aria-label="Next Work results"
                    disabled={
                      cache?.loading || (page >= maxPage && !cache?.hasNextPage)
                    }
                    onClick={() => void next()}
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
                <span
                  className="github-update github-work-updated"
                  title={`Last updated ${updated}. Aura refreshes Work every 5 minutes.`}
                >
                  <span>Updated</span>
                  <time
                    dateTime={
                      cache?.updatedAt
                        ? new Date(cache.updatedAt * 1000).toISOString()
                        : undefined
                    }
                  >
                    {updated}
                  </time>
                  {cache?.loading && <span className="sr-only">Updating</span>}
                </span>
                <button
                  type="button"
                  className="github-view-all"
                  aria-label={`${cache?.limited ? 'Limited · ' : ''}View all on GitHub`}
                  title={
                    cache?.limited
                      ? 'Coverage is limited. View all on GitHub; search returns up to 1,000 items and follows your repository access.'
                      : 'View all on GitHub'
                  }
                  onClick={() => void run(() => githubWorkOpen(category))}
                >
                  {cache?.limited && (
                    <span className="github-work-limit">Limited · </span>
                  )}
                  View all
                  <span className="github-work-link-label"> on GitHub</span>
                  <ExternalLink size={11} aria-hidden="true" />
                </button>
              </footer>
            </>
          )}
          {!connecting && permission && message && (
            <p className="github-work-access-message" role="status">
              {message}
            </p>
          )}
          {details && (
            <DialogPanel title="Work status" onClose={() => setDetails(false)}>
              <p
                className="github-work-status-message"
                role="status"
                tabIndex={0}
              >
                {message ??
                  'These are your last saved Work results. Refresh to check for updates.'}
              </p>
              <p className="github-work-status-update">
                Last updated {updated}. Aura refreshes every 5 minutes.
              </p>
              <div className="github-work-status-actions">
                <button
                  type="button"
                  disabled={connecting || !state.workPermission || refreshing}
                  onClick={() => {
                    setDetails(false);
                    void refresh();
                  }}
                >
                  Refresh Work
                </button>
                {state.workPermission && (
                  <button
                    type="button"
                    onClick={() => void run(() => githubWorkOpen(category))}
                  >
                    Open on GitHub
                  </button>
                )}
              </div>
            </DialogPanel>
          )}
        </GlassSurface>
      </section>
    </>
  );
}
