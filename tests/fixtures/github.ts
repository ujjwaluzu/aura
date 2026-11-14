import type { Page } from '@playwright/test';
import { mockMusic } from './music';
import type { GithubCalendar, GithubState } from '../../src/types/github';

export async function mockGithub(
  page: Page,
  options: {
    status?: GithubState['status'];
    stale?: boolean;
    empty?: boolean;
    theme?: string;
    end?: string;
    error?: string;
    workPermission?: boolean;
    workEmpty?: boolean;
    workLimited?: boolean;
    workError?: boolean;
    workCount?: number;
    workMessage?: string;
    workLoading?: boolean;
    longWorkFields?: boolean;
    login?: string;
  } = {},
) {
  await mockMusic(page);
  await page.addInitScript((options) => {
    type Internals = {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      transformCallback: (
        fn: (event: { payload: GithubState }) => void,
      ) => number;
    };
    const host = window as unknown as {
      __TAURI_INTERNALS__: Internals;
      githubTest: unknown;
    };
    const internals = host.__TAURI_INTERNALS__;
    const original = internals.invoke;
    const callbacks = new Map<
      number,
      (event: { payload: GithubState }) => void
    >();
    const transform = internals.transformCallback;
    internals.transformCallback = (fn) => {
      const id = transform(fn);
      callbacks.set(id, fn);
      return id;
    };
    const listeners = new Map<number, number>();
    let listenerId = 10000;
    const calls: { cmd: string; args: Record<string, unknown> }[] = [];
    // A leap year beginning Saturday can occupy all 54 week columns.
    const end = new Date(`${options.end ?? '2029-01-01'}T00:00:00Z`);
    const start = new Date(end);
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    const weeks: GithubCalendar['weeks'] = [];
    for (
      let date = new Date(start);
      date <= end;
      date.setUTCDate(date.getUTCDate() + 1)
    ) {
      if (!weeks.length || date.getUTCDay() === 0)
        weeks.push({ contributionDays: [] });
      weeks.at(-1)!.contributionDays.push({
        date: date.toISOString().slice(0, 10),
        weekday: date.getUTCDay(),
        contributionCount: 0,
        contributionLevel: 'NONE',
      });
    }
    const state: GithubState = {
      account:
        options.status && options.status !== 'connected'
          ? null
          : { accountId: 'U_fixture', login: options.login ?? 'octocat' },
      workPermission: options.workPermission ?? true,
      work: (['reviews', 'myPrs', 'failingPrs', 'issues'] as const).map(
        (category) => ({
          category,
          status:
            options.workPermission === false
              ? 'permission'
              : options.workError || options.workMessage
                ? 'error'
                : options.workLoading
                  ? 'loading'
                  : options.workEmpty
                    ? 'empty'
                    : 'ready',
          count: options.workError
            ? null
            : options.workEmpty
              ? 0
              : (options.workCount ?? 34),
          loading: options.workLoading ?? false,
          stale: options.stale ?? false,
          items:
            options.workError || options.workEmpty
              ? []
              : Array.from({ length: 30 }, (_, i) => ({
                  id: `${category}-${i}`,
                  title:
                    i === 0
                      ? 'A long title '.repeat(24)
                      : `${category} item ${i + 1}`,
                  repository: options.longWorkFields
                    ? 'an-organization-with-a-long-name/private-repository-with-a-very-long-name'
                    : i % 2
                      ? 'private-team/internal'
                      : 'octocat/public',
                  number: options.longWorkFields ? 123456 + i : i + 1,
                  private: i % 2 === 1,
                  updatedAt: new Date(Date.now() - i * 86400000).toISOString(),
                  draft: i === 1,
                  reviewDecision:
                    i === 2 ? 'CHANGES_REQUESTED' : 'REVIEW_REQUIRED',
                  checks:
                    category === 'failingPrs'
                      ? 'FAILURE'
                      : i === 0
                        ? null
                        : 'PENDING',
                })),
          cursor: 'cursor-30',
          hasNextPage: !options.workEmpty && !options.workError,
          limited: options.workLimited ?? false,
          updatedAt: options.workError ? null : Math.floor(Date.now() / 1000),
          message:
            options.workMessage ??
            (options.workError
              ? 'Work could not refresh. Aura will retry automatically.'
              : null),
        }),
      ),
      revision: 0,
      status: options.status ?? 'connected',
      configured: true,
      refreshing: false,
      stale: options.stale ?? false,
      authorization: null,
      retryAt: null,
      message: options.error ?? null,
      calendar:
        options.status && options.status !== 'connected'
          ? null
          : {
              accountId: 'U_fixture',
              login: 'octocat',
              weeks,
              totalContributions: 0,
              updatedAt: Math.floor(Date.now() / 1000),
            },
    };
    const emit = () => {
      state.revision++;
      for (const id of listeners.values())
        callbacks.get(id)?.({ payload: structuredClone(state) });
    };
    const updateToday = () => {
      if (!state.calendar) return;
      const day = state.calendar.weeks.at(-1)!.contributionDays.at(-1)!;
      day.contributionCount = options.empty ? 0 : 3;
      day.contributionLevel = options.empty ? 'NONE' : 'THIRD_QUARTILE';
      state.calendar.totalContributions = options.empty ? 0 : 3;
      state.calendar.updatedAt = Math.floor(Date.now() / 1000);
      state.stale = false;
      emit();
    };
    internals.invoke = async (cmd, args = {}) => {
      calls.push({ cmd, args });
      if (
        cmd === 'plugin:event|listen' &&
        args.event === 'aura://github-state'
      ) {
        const id = listenerId++;
        listeners.set(id, args.handler as number);
        return id;
      }
      if (
        cmd === 'plugin:event|unlisten' &&
        listeners.has(args.eventId as number)
      ) {
        listeners.delete(args.eventId as number);
        return;
      }
      if (cmd === 'github_status') return structuredClone(state);
      if (cmd === 'github_refresh') {
        if (!args.onlyIfStale) updateToday();
        return structuredClone(state);
      }
      if (cmd === 'github_work_open') return;
      if (cmd === 'github_work_refresh') {
        const cache = state.work.find((c) => c.category === args.category);
        if (cache && args.more) {
          cache.items.push(
            ...Array.from({ length: 4 }, (_, i) => ({
              ...cache.items[0],
              id: `${cache.category}-${i + 30}`,
              number: i + 31,
              title: `Later page item ${i + 31}`,
            })),
          );
          cache.hasNextPage = false;
        }
        if (!args.onlyIfStale)
          for (const c of state.work) {
            c.updatedAt = Math.floor(Date.now() / 1000);
            c.stale = false;
          }
        emit();
        return structuredClone(state);
      }
      if (cmd === 'github_start_authorization') {
        state.status = 'authorizing';
        state.authorization = {
          userCode: 'ABCD-EFGH',
          expiresAt: Math.floor(Date.now() / 1000) + 900,
        };
        state.message = null;
        emit();
        return structuredClone(state);
      }
      if (
        cmd === 'github_cancel_authorization' ||
        cmd === 'github_disconnect'
      ) {
        const preserve =
          cmd === 'github_cancel_authorization' && !!state.account;
        state.status = preserve ? 'connected' : 'disconnected';
        if (!preserve) {
          state.calendar = null;
          state.account = null;
          state.work = [];
        }
        state.authorization = null;
        state.message = null;
        emit();
        return structuredClone(state);
      }
      if (cmd === 'github_open_destination') return;
      if (cmd === 'get_preferences' && options.theme)
        return {
          themeId: options.theme,
          layoutId: 'clock-left-stats-music',
          account:
            options.status && options.status !== 'connected'
              ? null
              : { accountId: 'U_fixture', login: 'octocat' },
          workPermission: options.workPermission ?? true,
          work: (['reviews', 'myPrs', 'failingPrs', 'issues'] as const).map(
            (category) => ({
              category,
              status:
                options.workPermission === false
                  ? 'permission'
                  : options.workError
                    ? 'error'
                    : options.workEmpty
                      ? 'empty'
                      : 'ready',
              count: options.workError ? null : options.workEmpty ? 0 : 34,
              loading: false,
              stale: options.stale ?? false,
              items:
                options.workError || options.workEmpty
                  ? []
                  : Array.from({ length: 30 }, (_, i) => ({
                      id: `${category}-${i}`,
                      title:
                        i === 0
                          ? 'A long title '.repeat(24)
                          : `${category} item ${i + 1}`,
                      repository:
                        i % 2 ? 'private-team/internal' : 'octocat/public',
                      number: i + 1,
                      private: i % 2 === 1,
                      updatedAt: new Date(
                        Date.now() - i * 86400000,
                      ).toISOString(),
                      draft: i === 1,
                      reviewDecision:
                        i === 2 ? 'CHANGES_REQUESTED' : 'REVIEW_REQUIRED',
                      checks:
                        category === 'failingPrs'
                          ? 'FAILURE'
                          : i === 0
                            ? null
                            : 'PENDING',
                    })),
              cursor: 'cursor-30',
              hasNextPage: !options.workEmpty && !options.workError,
              limited: options.workLimited ?? false,
              updatedAt: options.workError
                ? null
                : Math.floor(Date.now() / 1000),
              message: options.workError
                ? 'Work could not refresh. Aura will retry automatically.'
                : null,
            }),
          ),
          revision: 0,
          warning: null,
        };
      return original(cmd, args);
    };
    host.githubTest = {
      calls,
      updateToday,
      fail: (status: GithubState['status'], message: string) => {
        state.status = status;
        state.message = message;
        state.stale = !!state.calendar;
        emit();
      },
      deny: () => {
        state.status = state.account ? 'connected' : 'failed';
        state.authorization = null;
        state.message =
          'GitHub authorization was denied. Try connecting again.';
        emit();
      },
      approve: () => {
        state.status = 'connected';
        state.account = { accountId: 'U_fixture', login: 'octocat' };
        state.authorization = null;
        state.workPermission = true;
        state.message = null;
        for (const c of state.work)
          if (c.status === 'permission') c.status = 'ready';
        emit();
      },
      workOffline: () => {
        for (const c of state.work) {
          c.stale = true;
          c.status = 'error';
          c.message = 'Work could not refresh. Aura will retry automatically.';
        }
        emit();
      },
      oldEvent: () => {
        const old = { ...state, revision: 0, status: 'connected' };
        for (const id of listeners.values())
          callbacks.get(id)?.({ payload: old as GithubState });
      },
    };
  }, options);
}
