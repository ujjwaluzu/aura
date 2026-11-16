const themes = {
  'faulty-terminal': [
    'Faulty Terminal',
    'Green phosphor, scanlines and interactive glitches.',
  ],
  galaxy: [
    'Galaxy',
    'Twinkling stars, gentle rotation and click-to-warp flight.',
  ],
  'letter-glitch': ['Letter Glitch', 'Letters, mint flashes and click tears.'],
  'pixel-snow': ['Pixel Snow', 'Falling snowflakes with a soft glow.'],
};
document.querySelectorAll('[data-theme]').forEach((button) => {
  button.addEventListener('click', () => {
    const id = button.dataset.theme;
    const [name, description] = themes[id];
    document
      .querySelectorAll('[data-theme]')
      .forEach((item) =>
        item.setAttribute('aria-pressed', String(item === button)),
      );
    const image = document.getElementById('theme-image');
    image.src = `${import.meta.env.BASE_URL}images/widget-${id}.png`;
    image.alt = `Aura application in ${name} theme with synthetic demonstration data.`;
    document.getElementById('theme-caption').textContent =
      `${name}. ${description}`;
  });
});

const themeButtons = [...document.querySelectorAll('[data-theme]')];
themeButtons.forEach((button, index) => {
  button.addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % themeButtons.length;
    if (event.key === 'ArrowLeft')
      next = (index - 1 + themeButtons.length) % themeButtons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = themeButtons.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    themeButtons[next].focus();
    themeButtons[next].click();
  });
});

// Deterministic illustrative activity, not a real account or contribution count.
const contributions = document.querySelector('.contribution-grid');
for (let index = 0; index < 65; index++) {
  const cell = document.createElement('i');
  const levels = [0.08, 0.18, 0.35, 0.6, 0.85, 1];
  cell.style.setProperty(
    '--level',
    levels[
      (index * 11 + Math.floor(index / 3) * 7 + Math.floor(index / 7)) %
        levels.length
    ],
  );
  contributions.append(cell);
}

// Animate on entry without hiding content before JavaScript or observation runs.
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const scrollTargets = [
  ...document.querySelectorAll(
    '.section-heading, .quick-facts, .feature, .theme-picker > button, .theme-preview, .settings-row, .install-steps > li, .download-panel, .faq-section > div:first-child, .faq-list > details, .footer-main, .footer-base',
  ),
];
const scrollAnimations = new Map();
let scrollObserver;

function prepareScrollAnimations() {
  scrollObserver?.disconnect();
  scrollAnimations.forEach((animation) => animation.cancel());
  scrollAnimations.clear();
  scrollTargets.forEach((element) => {
    element.dataset.scrollReveal = 'static';
  });
  if (motionPreference.matches || !('IntersectionObserver' in window)) return;

  scrollObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting || target.dataset.scrollReveal !== 'waiting')
          return;
        scrollObserver.unobserve(target);
        target.dataset.scrollReveal = 'visible';
        if (typeof target.animate !== 'function') return;
        const staggered = target.matches(
          '.feature, .theme-picker > button, .install-steps > li',
        );
        const index = staggered
          ? [...target.parentElement.children].indexOf(target)
          : 0;
        const animation = target.animate(
          [
            { opacity: 0, transform: 'translateY(18px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: 560,
            delay: Math.min(index * 45, 135),
            easing: 'cubic-bezier(.22, 1, .36, 1)',
            fill: 'backwards',
          },
        );
        scrollAnimations.set(target, animation);
        const complete = () => {
          if (scrollAnimations.get(target) === animation)
            scrollAnimations.delete(target);
        };
        animation.finished.then(complete, complete);
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -24px 0px' },
  );

  scrollTargets.forEach((element) => {
    if (element.getBoundingClientRect().top < window.innerHeight - 24) return;
    element.dataset.scrollReveal = 'waiting';
    scrollObserver.observe(element);
  });
}

motionPreference.addEventListener('change', prepareScrollAnimations);
document.addEventListener('focusin', (event) => {
  const target =
    event.target instanceof Element
      ? event.target.closest('[data-scroll-reveal]')
      : null;
  if (!target) return;
  scrollObserver?.unobserve(target);
  scrollAnimations.get(target)?.cancel();
  target.dataset.scrollReveal = 'visible';
});
prepareScrollAnimations();

// This generated file comes only from a checksum-verified release manifest.
fetch(`${import.meta.env.BASE_URL}release.json`)
  .then((response) => {
    if (!response.ok) throw new Error('Release metadata unavailable');
    return response.json();
  })
  .then((release) => {
    const expected = `https://github.com/ujjwaluzu/aura/releases/download/v${release.version}/Aura_${release.version}_x64-setup.exe`;
    if (
      release.downloadUrl !== expected ||
      !/^[a-f0-9]{64}$/.test(release.sha256) ||
      !Number.isSafeInteger(release.sizeBytes) ||
      release.sizeBytes <= 0
    )
      throw new Error('Invalid release metadata');
    document.querySelectorAll('.download-link').forEach((link) => {
      link.href = release.downloadUrl;
    });
    document.querySelectorAll('[data-version]').forEach((element) => {
      element.textContent = release.version;
    });
    document.querySelectorAll('[data-size]').forEach((element) => {
      element.textContent = `${(release.sizeBytes / 1048576).toFixed(2)} MiB`;
    });
    document.querySelector('[data-checksum]').textContent =
      `SHA-256: ${release.sha256}`;
    document.querySelector('[data-release-notes]').href = release.releaseUrl;
  })
  .catch(() => {
    document.querySelectorAll('.download-link').forEach((link) => {
      link.textContent = 'View beta release on GitHub';
      link.href =
        'https://github.com/ujjwaluzu/aura/releases/tag/v0.1.3-beta.1';
    });
  });
