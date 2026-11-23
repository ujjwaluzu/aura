# Aura website

Independent static HTML/CSS/JavaScript showcase, built with the repository's Vite.
`pnpm.cmd website:dev` serves `/` at port 1430. Output is `website/dist/`;
desktop builds continue to use the root `dist/`.

The visual system uses warm ivory (`#f8f7f3`), near-black (`#171714`) and
cobalt (`#2854ff`), with neutral tints for surfaces and dividers. Bodoni Moda,
Anton and DM Sans are served locally from `public/fonts/`, alongside their OFL
licenses. Actual app screenshots retain their original theme colors.
The hero uses `public/images/aura-galaxy-clean.png`, an AI-cleaned Galaxy preview
derived from the supplied screenshot. The edit removes desktop/code text showing
through the translucent widget background. The full preview scales responsively
without cropping its controls. The original `public/images/aura-galaxy-live.png`
is retained as a reference; generation details are in [hero-image-prompt.md](hero-image-prompt.md).
The website logo and favicon retain the app's original A-and-orbit SVG geometry,
recolored to the website palette. Feature artwork uses labelled demo data. Theme
previews support clicks, arrow keys, Home and End. The selected preview theme is
saved in browser local storage under `aura.website.theme` and restored with its
image, caption and selected button. Missing or invalid values default to Galaxy;
blocked storage never prevents theme switching. Motion respects reduced-motion
preferences.

The hero describes Aura directly as desktop widgets for Windows. Page decoration
uses typography and imagery without icons, emoji or eyebrow labels. Sections and
cards reveal over the first 20% of their passage through the viewport, following
scroll position in both directions. Horizontal columns stagger by scroll distance;
single-column layouts reset the stagger. Screenshot frames have gentle parallax
without changing their crop or scale. Native CSS view timelines are enabled before
first paint; unsupported browsers scrub paused Web Animations with one passive
scroll listener and layout geometry cached on resize/content changes. Initially
visible fallback content stays settled. Content remains visible without JavaScript,
reduced-motion immediately disables motion, and focused content stays fully visible.

Theme cards use static captures of the actual app background renderers, rather
than decorative approximations. Regenerate only these assets in PowerShell with
`$env:AURA_CAPTURE_THEME_BACKGROUNDS='1'; pnpm.cmd website:capture`.
This mode hides the app controls and saves four 640 by 400 images without
overwriting the full widget captures.

`pnpm.cmd website:build --preview` builds a source preview without inventing
installer metadata. `pnpm.cmd website:test` checks the built site at phone,
tablet and desktop widths, keyboard navigation, images, policy pages, theme
switching and versioned download links. Test metadata is intercepted only in
the browser suite and never emitted into production assets.

For publication, `pnpm.cmd release:publish verify-public` downloads the public
prerelease and validates its installer SHA-256 against the manifest/checksums.
`pnpm.cmd website:build` requires those verified files in
`artifacts/public-release/`. Alternate local inputs use `AURA_RELEASE_MANIFEST`
and `AURA_RELEASE_INSTALLER`. The build verifies size, hash, version, unsigned
status and release gates, then generates metadata and both static download
buttons. No `/releases/latest` URL is used.

Policies are rendered from the repository's `PRIVACY.md` and `MUSIC_TERMS.md`;
the website adds a GitHub Pages hosting disclosure. There is no backend, login,
tracking, third-party font request or payment flow.

Screenshots are captured from the actual React application with synthetic IPC
fixtures using `pnpm.cmd website:capture`. All captures use the public beta's
gated Google state and contain no real accounts, credentials or remote artwork.
The hero is an AI-cleaned preview based on the supplied screenshot and its visible
music session. Gallery captures are labelled synthetic demo data. Images are
stored in `website/public/images/` and are not evidence of native integration
passing. Website branding uses the custom SVG mark and favicon.

Publication is through `.github/workflows/publish-beta.yml`, after the
prerelease is published. Pages-only retries preserve published installer bytes.
