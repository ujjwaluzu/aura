import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page, mode: 'native' | 'fallback') {
  if (mode === 'fallback') {
    await page.addInitScript(() => {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = ((...args: string[]) =>
        args.some((value) => value.includes('animation-timeline'))
          ? false
          : Reflect.apply(supports, CSS, args)) as typeof CSS.supports;
    });
  }
  await page.goto('./');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('html')).toHaveAttribute(
    'data-scroll-motion',
    mode,
  );
}

async function move(page: Page, selector: string, passage: number) {
  await page.locator(selector).evaluate((element, progress) => {
    let top = 0;
    for (
      let box = element as HTMLElement | null;
      box;
      box = box.offsetParent as HTMLElement | null
    )
      top += box.offsetTop;
    window.scrollTo({
      top:
        top -
        innerHeight +
        (innerHeight + (element as HTMLElement).offsetHeight) * progress,
      behavior: 'instant',
    });
  }, passage);
}

async function opacity(page: Page, selector: string) {
  return page
    .locator(selector)
    .evaluate((element) => Number(getComputedStyle(element).opacity));
}

async function translation(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const value = getComputedStyle(element).translate;
    return value === 'none' ? 0 : parseFloat(value.split(' ')[1]);
  });
}

for (const mode of ['native', 'fallback'] as const) {
  test(`${mode}: reversible reveals, columns, parallax, focus and reduced motion`, async ({
    page,
  }, testInfo) => {
    await prepare(page, mode);
    const mobile = testInfo.project.name !== 'desktop';
    const first = '.theme-picker > button:first-child';
    const initialOpacity = mobile ? 0.55 : 0.35;
    await move(page, first, 0);
    await expect
      .poll(() => opacity(page, first))
      .toBeCloseTo(initialOpacity, 2);
    await expect
      .poll(() => translation(page, first))
      .toBeCloseTo(mobile ? 12 : 24, 0);
    await move(page, first, 0.08);
    await expect
      .poll(() => opacity(page, first))
      .toBeGreaterThan(initialOpacity + 0.15);
    const midway = await opacity(page, first);
    expect(midway).toBeLessThan(0.99);
    await move(page, first, 0.25);
    await expect.poll(() => opacity(page, first)).toBe(1);
    await move(page, first, 0.08);
    await expect.poll(() => opacity(page, first)).toBeCloseTo(midway, 2);
    // Small increments and a fast jump must reach the same scroll-linked result.
    for (const progress of [0.09, 0.1, 0.11, 0.12])
      await move(page, first, progress);
    await move(page, first, 0);
    await expect
      .poll(() => opacity(page, first))
      .toBeCloseTo(initialOpacity, 2);

    const stagger = await page
      .locator('.feature')
      .evaluateAll((elements) =>
        elements.map((element) =>
          getComputedStyle(element).getPropertyValue('--motion-stagger').trim(),
        ),
      );
    expect(stagger).toEqual(mobile ? ['0%', '0%', '0%'] : ['0%', '2%', '4%']);
    const themes = await page
      .locator('.theme-picker > button')
      .evaluateAll((elements) =>
        elements.map((element) =>
          getComputedStyle(element).getPropertyValue('--motion-stagger').trim(),
        ),
      );
    expect(themes).toEqual(
      mobile ? ['0%', '2%', '0%', '2%'] : ['0%', '2%', '4%', '6%'],
    );
    if (testInfo.project.name === 'phone') {
      expect(
        await page
          .locator('.install-steps > li')
          .evaluateAll((elements) =>
            elements.map((element) =>
              getComputedStyle(element)
                .getPropertyValue('--motion-stagger')
                .trim(),
            ),
          ),
      ).toEqual(['0%', '0%', '0%']);
    }
    // Compare columns at equal geometry, rather than relying only on variables.
    await move(page, '.theme-picker > button:first-child', 0.03);
    await expect
      .poll(
        async () =>
          (await opacity(page, '.theme-picker > button:first-child')) -
          (await opacity(page, '.theme-picker > button:nth-child(2)')),
      )
      .toBeGreaterThan(0.1);

    const dimensions = () =>
      page
        .locator('.hero-screenshot-crop, .hero-screenshot, #theme-image')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const box = element as HTMLElement;
            return [
              box.offsetWidth,
              box.offsetHeight,
              getComputedStyle(box).objectFit,
            ];
          }),
        );
    const original = await dimensions();
    await move(page, '.theme-preview', 0.25);
    await expect
      .poll(() => translation(page, '.theme-preview'))
      .toBeCloseTo(mobile ? 4 : 12, 0);
    await move(page, '.theme-preview', 0.75);
    await expect
      .poll(() => translation(page, '.theme-preview'))
      .toBeCloseTo(mobile ? -4 : -12, 0);
    await move(page, '.theme-preview', 0.25);
    await expect
      .poll(() => translation(page, '.theme-preview'))
      .toBeCloseTo(mobile ? 4 : 12, 0);
    expect(await dimensions()).toEqual(original);

    await move(page, '.theme-picker > button:first-child', 0.02);
    await page.locator('.theme-picker > button:first-child').focus();
    await expect
      .poll(() => opacity(page, '.theme-picker > button:first-child'))
      .toBe(1);
    expect(await translation(page, '.theme-picker > button:first-child')).toBe(
      0,
    );
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByRole('button', { name: 'Galaxy', exact: true }),
    ).toBeFocused();
    expect(await opacity(page, '.theme-picker > button:nth-child(2)')).toBe(1);
    await page
      .locator('button:focus')
      .evaluate((element) => (element as HTMLElement).blur());

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(() => page.evaluate(() => document.getAnimations().length))
      .toBe(0);
    await move(page, first, 0);
    expect(await opacity(page, first)).toBe(1);
    expect(await translation(page, first)).toBe(0);
    expect(await translation(page, '.theme-preview')).toBe(0);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('html')).toHaveAttribute(
      'data-scroll-motion',
      mode,
    );
    await expect
      .poll(() => opacity(page, first))
      .toBeCloseTo(initialOpacity, 2);
    await move(page, '.theme-preview', 0.5);
    await page.screenshot({
      path: `artifacts/motion-${mode}-${testInfo.project.name}.png`,
    });
  });

  test(`${mode}: initial readability, anchor navigation and restored scroll`, async ({
    page,
  }, testInfo) => {
    await prepare(page, mode);
    expect(await opacity(page, '.hero h1')).toBe(1);
    expect(await opacity(page, '.hero-copy')).toBe(1);
    if (mode === 'fallback') {
      expect(await translation(page, '.hero-screenshot-crop')).toBe(0);
    }
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Themes', exact: true })
      .click();
    await expect
      .poll(() =>
        page
          .locator('#themes')
          .evaluate((element) => Math.abs(element.getBoundingClientRect().top)),
      )
      .toBeLessThan(40);
    await expect.poll(() => opacity(page, '#themes .section-heading')).toBe(1);
    const position = await page.evaluate(() => scrollY);
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeCloseTo(position, 0);
    await expect.poll(() => opacity(page, '#themes .section-heading')).toBe(1);
    // Restoring a deep position only settles visible content. Cards above it
    // must still follow scroll when we reverse back toward the top.
    await move(page, '.feature:nth-child(3)', 0);
    await expect
      .poll(() => opacity(page, '.feature:nth-child(3)'))
      .toBeCloseTo(testInfo.project.name === 'desktop' ? 0.35 : 0.55, 2);
    await page.goto('./#install');
    await expect.poll(() => opacity(page, '#install .section-heading')).toBe(1);
  });
}

test('without JavaScript, motion targets and downloads remain readable', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: testInfo.project.use.viewport,
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:1430/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(
    await page.locator('[data-motion]').evaluateAll((elements) =>
      elements.every((element) => {
        const style = getComputedStyle(element);
        return style.opacity === '1' && style.translate === 'none';
      }),
    ),
  ).toBe(true);
  await expect(page.locator('.download-link').first()).toHaveAttribute(
    'href',
    /releases\/(?:download|tag)\/v0\.1\.3-beta\.\d+/,
  );
  await context.close();
});
