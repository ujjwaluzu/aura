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
      `${name} — ${description}`;
  });
});

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
      link.textContent = 'View beta release on GitHub ↗';
      link.href =
        'https://github.com/ujjwaluzu/aura/releases/tag/v0.1.3-beta.1';
    });
  });
