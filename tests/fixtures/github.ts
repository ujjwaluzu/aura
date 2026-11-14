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
        state.status = 'disconnected';
        state.calendar = null;
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
        state.status = 'failed';
        state.authorization = null;
        state.message =
          'GitHub authorization was denied. Try connecting again.';
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
