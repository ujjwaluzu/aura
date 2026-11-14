import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { GlassSurface } from '../../ui/GlassSurface';
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
function status(item: GithubWorkItem, category: GithubWorkCategory) {
  if (category === 'issues') return 'Assigned';
  const checks =
    (
      {
        SUCCESS: 'Checks passing',
        FAILURE: 'Checks failing',
        ERROR: 'Checks failing',
        PENDING: 'Checks pending',
        EXPECTED: 'Checks expected',
      } as Record<string, string>
    )[item.checks ?? ''] ?? 'Checks unknown';
  const review = (
    {
      APPROVED: 'Approved',
      CHANGES_REQUESTED: 'Changes requested',
      REVIEW_REQUIRED: 'Review required',
    } as Record<string, string>
  )[item.reviewDecision ?? ''];
  return [item.draft ? 'Draft' : review, checks].filter(Boolean).join(' · ');
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
  const cache = state.work.find((c) => c.category === category);
  const maxPage = Math.max(0, Math.ceil((cache?.items.length ?? 0) / 3) - 1);
  const page = Math.min(pages[category] ?? 0, maxPage);
  const items = cache?.items.slice(page * 3, page * 3 + 3) ?? [];
  const connecting =
    state.status === 'requesting' || state.status === 'authorizing';
  const permission = !state.workPermission || cache?.status === 'permission';
  const selectPage = (next: number) =>
    setPages((previous) => ({ ...previous, [category]: next }));
  const next = async () => {
    if (page < maxPage) {
      selectPage(page + 1);
      return;
    }
    selectPage(page + 1);
    await run(() => githubWorkRefresh(false, category, true));
  };
  return (
    <>
      <div className="primary-slot github-overview-slot">
        <section
          className="github-work-overview"
          aria-label="GitHub Work categories"
        >
          <h2>Work</h2>
          <div className="github-work-tiles">
            {workCategories.map(({ id, label }) => {
              const c = state.work.find((entry) => entry.category === id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={category === id}
                  onClick={() => select(id)}
                >
                  <span>{label}</span>
                  <strong>
                    {c?.count == null ? '—' : c.count.toLocaleString()}
                  </strong>
                  <span className="sr-only">
                    {c?.count == null ? 'unavailable' : c.stale ? 'stale' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        {navigation}
      </div>
      <div className="widget-divider" aria-hidden="true" />
      <section className="github-slot" aria-label="GitHub Work">
        <GlassSurface
          variant="inset"
          opacity={0.35}
          className="github-card github-work-card"
        >
          <header className="github-header">
            <span>
              {workCategories.find((c) => c.id === category)?.label}{' '}
              <small>@{state.account?.login}</small>
            </span>
            <div className="github-actions">
              <button
                type="button"
                aria-label="Refresh GitHub Work"
                title="Refresh Work"
                disabled={
                  connecting ||
                  !state.workPermission ||
                  state.work.some((c) => c.loading)
                }
                onClick={() => void run(() => githubWorkRefresh())}
              >
                <RefreshCw
                  size={13}
                  className={
                    state.work.some((c) => c.loading)
                      ? 'github-spinning'
                      : undefined
                  }
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
                  <button
                    className="github-work-row"
                    type="button"
                    key={item.id}
                    title={item.title}
                    onClick={() =>
                      void run(() => githubWorkOpen(category, item.id))
                    }
                  >
                    <strong>{item.title}</strong>
                    <span className="github-work-meta">
                      <span>
                        {item.repository} #{item.number}
                        {item.private ? ' · Private' : ''}
                      </span>
                      <time dateTime={item.updatedAt}>
                        {age(item.updatedAt)}
                      </time>
                    </span>
                    <span className="github-work-status">
                      {status(item, category)}
                    </span>
                  </button>
                ))}
                {!items.length && (
                  <p className="github-work-empty" role="status">
                    {cache?.count === 0 && cache.status === 'empty'
                      ? 'You’re all caught up.'
                      : cache?.loading || cache?.status === 'loading' || !cache
                        ? 'Loading Work…'
                        : 'Work is unavailable. Refresh to retry.'}
                  </p>
                )}
              </div>
              <div className="github-work-footer">
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
                    <ChevronLeft size={12} />
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
                    <ChevronRight size={12} />
                  </button>
                </div>
                <button
                  type="button"
                  className="github-view-all"
                  title="GitHub search returns up to 1,000 items. Results follow repository access, organization restrictions and GitHub’s search index."
                  onClick={() => void run(() => githubWorkOpen(category))}
                >
                  {cache?.limited ? 'Limited · ' : ''}View all on GitHub
                </button>
              </div>
              <div className="github-update">
                <span>
                  Last updated{' '}
                  {cache?.updatedAt
                    ? new Date(cache.updatedAt * 1000).toLocaleTimeString(
                        undefined,
                        { hour: '2-digit', minute: '2-digit' },
                      )
                    : '—'}
                  {cache?.stale ? ' · Stale' : ''}
                  {cache?.loading ? ' · Updating' : ''}
                </span>
                <span>Refreshes every 5 min</span>
              </div>
            </>
          )}
          {(error ||
            cache?.message ||
            (connecting || permission ? state.message : null)) && (
            <p
              className="github-message"
              role="status"
              title={error ?? cache?.message ?? state.message ?? undefined}
            >
              {error ?? cache?.message ?? state.message}
            </p>
          )}
        </GlassSurface>
      </section>
    </>
  );
}
