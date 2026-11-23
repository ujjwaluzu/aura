import { chromium, expect, test } from '@playwright/test';
import { layouts } from '../src/features/layouts/catalog';
import { themes } from '../src/features/themes/catalog';
import type { Preferences } from '../src/types/preferences';
import type { PlaybackState } from '../src/types/music';

/** Real packaged WebView IPC against a task-owned Aura instance. */
test('Settings permissions, navigation reuse, playback events and preferences over Rust IPC', async () => {
  test.setTimeout(120_000);
  const browser = await chromium.connectOverCDP(process.env.AURA_NATIVE_CDP!);
  let host = browser.contexts().flatMap((context) => context.pages())[0];
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    host ??= browser.contexts().flatMap((context) => context.pages())[0];
    const url = host
      ? await host.evaluate(() => location.href).catch(() => '')
      : '';
    if (/tauri.localhost|127.0.0.1:1420/.test(url)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!host) throw new Error('No Aura widget host found.');
  const context = host.context();
  const invoke = <T>(
    page: typeof host,
    command: string,
    args: Record<string, unknown> = {},
    captureError = false,
  ) =>
    page.evaluate(
      ({ command, args, captureError }) =>
        (
          window as unknown as {
            __TAURI_INTERNALS__: {
              invoke: (
                command: string,
                args: Record<string, unknown>,
              ) => Promise<unknown>;
            };
          }
        ).__TAURI_INTERNALS__
          .invoke(command, args)
          .catch((e: unknown) => {
            if (captureError) return e;
            throw e;
          }),
      { command, args, captureError },
    ) as Promise<T>;
  await expect(
    host.getByRole('status', { name: 'Native connection' }),
  ).toHaveText('Native core connected', { timeout: 30_000 });
  const original = await invoke<Preferences>(host, 'get_preferences');
  const originalPlayback = await invoke<PlaybackState>(
    host,
    'music_playback_status',
  );
  let settings = context
    .pages()
    .find((p) => p.url().includes('window=settings'));
  try {
    await expect(
      host.getByRole('status', { name: 'Native connection' }),
    ).toHaveText('Native core connected', { timeout: 30_000 });
    expect(
      await invoke(host, 'get_foundation_info', { protocolVersion: 0 }, true),
    ).toMatchObject({ code: 'PROTOCOL_MISMATCH' });
    if (!settings) {
      const created = context.waitForEvent('page');
      await invoke(host, 'open_music');
      settings = await created;
    } else await invoke(host, 'open_music');
    await expect(
      settings.getByRole('heading', { name: 'Settings', exact: true }),
    ).toBeVisible();
    await invoke(host, 'open_settings', { destination: 'general' });
    await expect(
      settings.getByRole('tab', { name: 'General', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    if (process.env.AURA_EXPECT_ISOLATED) {
      expect(await invoke(settings, 'get_startup_status')).toMatchObject({
        available: false,
        enabled: false,
      });
      expect(
        await invoke(settings, 'set_startup_enabled', { enabled: true }, true),
      ).toMatchObject({ code: 'STARTUP_UNAVAILABLE' });
      await expect(
        settings.getByRole('switch', { name: 'Start Aura with Windows' }),
      ).toBeDisabled();
    }
    for (const command of ['get_startup_status', 'set_startup_enabled']) {
      expect(
        JSON.stringify(await invoke(host, command, { enabled: true }, true)),
      ).toMatch(/not allowed|denied/i);
    }
    for (const command of [
      'plugin:autostart|enable',
      'plugin:autostart|disable',
      'plugin:autostart|is_enabled',
    ]) {
      expect(JSON.stringify(await invoke(settings, command, {}, true))).toMatch(
        /not allowed|denied|not found/i,
      );
    }
    await invoke(host, 'open_music');
    await expect(
      settings.getByRole('heading', { name: 'Now playing', exact: true }),
    ).toBeVisible();
    await expect(settings.locator('body')).toHaveCSS(
      'background-color',
      'rgb(17, 19, 24)',
    );
    const dimensions = await settings.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    expect(dimensions.width).toBeGreaterThanOrEqual(720);
    expect(dimensions.height).toBeGreaterThanOrEqual(500);
    await invoke(host, 'open_settings', { destination: 'music-player' });
    await expect(
      settings.getByRole('heading', { name: 'Now playing', exact: true }),
    ).toBeVisible();
    await expect(
      settings.getByRole('heading', { name: 'Browser media' }),
    ).toBeVisible();
    await expect(
      settings.getByRole('button', { name: 'Connect YouTube', exact: true }),
    ).toHaveCount(0);
    for (const command of [
      'music_account_status',
      'music_connect',
      'music_browse',
      'music_change',
    ]) {
      expect(JSON.stringify(await invoke(settings, command, {}, true))).toMatch(
        /not allowed|denied/i,
      );
    }
    expect(
      await invoke(
        settings,
        'music_open_policy',
        { target: 'https://example.com' },
        true,
      ),
    ).toMatchObject({ code: 'INVALID_INPUT' });
    const state = await invoke<PlaybackState>(
      settings,
      'music_playback_status',
    );
    expect(Array.isArray(state.sessions)).toBe(true);
    // Subscription must receive an event caused by a real Rust session command.
    await settings.evaluate(() => {
      Object.assign(window, { auraPlaybackEvents: 0 });
      const api = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            transformCallback: (fn: () => void) => number;
            invoke: (cmd: string, args: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      return api.invoke('plugin:event|listen', {
        event: 'aura://playback-changed',
        target: { kind: 'Any' },
        handler: api.transformCallback(() => {
          (window as unknown as { auraPlaybackEvents: number })
            .auraPlaybackEvents++;
        }),
      });
    });
    await invoke(settings, 'music_select_session', {
      id: state.sessions[0]?.id ?? null,
    });
    await expect
      .poll(() =>
        settings!.evaluate(
          () =>
            (window as unknown as { auraPlaybackEvents: number })
              .auraPlaybackEvents,
        ),
      )
      .toBeGreaterThan(0);
    await expect(settings.getByLabel('Windows media session')).toHaveValue(
      state.sessions[0]?.id ?? '',
    );
    if (state.sessions[0]) {
      await settings
        .getByLabel('Windows media session')
        .selectOption(state.sessions[0].id);
      await expect
        .poll(
          async () =>
            (await invoke<PlaybackState>(host, 'music_playback_status'))
              .selectedId,
        )
        .toBe(state.sessions[0].id);
      await expect(host.locator('.player-information strong')).toHaveText(
        state.sessions[0].title || 'Untitled media',
      );
    }
    // Unmount the widget's automatic single-player binding before testing an empty selection.
    await host.getByRole('button', { name: 'Next widget page' }).click();
    await invoke(settings, 'music_select_session', { id: null });
    for (const [command, args] of [
      ['music_media_control', { action: 'pause' }],
      ['music_media_seek', { positionSeconds: 1 }],
      ['music_media_volume', { level: null }],
      ['music_select_session', { id: 'missing-session' }],
    ] as const) {
      const result = await invoke<{ code: string }>(
        settings,
        command,
        args,
        true,
      );
      expect(['MEDIA_UNAVAILABLE', 'BROWSER_VOLUME_UNAVAILABLE']).toContain(
        result.code,
      );
    }
    await host.getByRole('button', { name: 'Previous widget page' }).click();
    // Invalid inputs prove these commands reached native validation rather than ACL denial.
    for (const [command, args] of [
      [
        'music_open_player',
        { target: { kind: 'track', id: 'https://invalid.test' } },
      ],
    ] as const) {
      const result = await invoke(settings, command, args, true);
      expect(JSON.stringify(result), command).not.toMatch(
        /not allowed|denied/i,
      );
      expect(result).toHaveProperty('code');
    }
    await invoke(host, 'open_settings');
    await expect(
      settings.getByRole('heading', { name: 'Now playing', exact: true }),
    ).toBeVisible();
    await invoke(host, 'open_settings', { destination: 'theme' });
    for (const theme of themes) {
      const option = settings.getByRole('button', {
        name: `${theme.name} theme`,
      });
      await expect(option).toBeEnabled();
      await option.dispatchEvent('click');
      await expect(host.getByLabel('Aura widget host')).toHaveAttribute(
        'data-theme',
        theme.id,
      );
    }
    await invoke(host, 'open_settings', { destination: 'layout' });
    await expect(settings.locator('.layout-option')).toHaveCount(
      layouts.length,
    );
    for (const layout of layouts) {
      const option = settings.getByRole('button', {
        name: `${layout.title}, ${layout.description}`,
        exact: true,
      });
      await expect(option).toBeEnabled();
      await option.dispatchEvent('click');
      await expect(host.getByLabel('Aura widget host')).toHaveAttribute(
        'data-layout',
        layout.id,
      );
    }
    for (const command of ['get_system_snapshot', 'get_foundation_info'])
      expect(
        JSON.stringify(
          await invoke(settings, command, { protocolVersion: 1 }, true),
        ),
      ).toMatch(/not allowed|denied/i);
    expect(
      JSON.stringify(
        await invoke(
          host,
          'set_preferences',
          { patch: { themeId: 'faulty-terminal' } },
          true,
        ),
      ),
    ).toMatch(/not allowed|denied/i);
    await invoke(host, 'open_music');
    await expect(
      settings.getByRole('heading', { name: 'Now playing', exact: true }),
    ).toBeVisible();
    expect(
      context.pages().filter((p) => p.url().includes('window=settings')),
    ).toHaveLength(1);
    expect(
      context.pages().filter((p) => p.url().includes('window=music')),
    ).toHaveLength(0);
    await invoke(settings, 'set_preferences', {
      patch: { themeId: original.themeId, layoutId: original.layoutId },
    });
    await invoke(settings, 'music_select_session', {
      id: originalPlayback.selectedId,
    });
    await settings.screenshot({
      path: 'artifacts/aura-settings-browser-native.png',
    });
    const beforeClose = await invoke<PlaybackState>(
      host,
      'music_playback_status',
    );
    const closed = settings.waitForEvent('close');
    await settings.getByRole('button', { name: 'Done' }).dispatchEvent('click');
    await closed;
    expect(
      (await invoke<PlaybackState>(host, 'music_playback_status')).selectedId,
    ).toBe(beforeClose.selectedId);
    const reopened = context.waitForEvent('page');
    await invoke(host, 'open_settings', { destination: 'music-search' });
    settings = await reopened;
    await expect(
      settings.getByRole('heading', { name: 'Browser media' }),
    ).toBeVisible();
    await settings.getByRole('button', { name: 'Done' }).dispatchEvent('click');
  } finally {
    // Restore user preferences/session even when assertions fail.
    if (settings && !settings.isClosed()) {
      await invoke(settings, 'set_preferences', {
        patch: { themeId: original.themeId, layoutId: original.layoutId },
      }).catch(() => {});
    }
    await invoke(host, 'music_select_session', {
      id: originalPlayback.selectedId,
    }).catch(() => {});
    await browser.close();
  }
});
