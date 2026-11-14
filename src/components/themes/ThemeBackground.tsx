import FaultyTerminal from './FaultyTerminal';

/** Shared by the live widget pages and the settings thumbnails. */
export function ThemeBackground({ preview = false }: { preview?: boolean }) {
  return (
    <div className="theme-background" aria-hidden="true">
      <FaultyTerminal
        tint="#A7EF9E"
        glyphs="blocks"
        scale={1.5}
        digitSize={1.2}
        timeScale={0.5}
        brightness={0.75}
        glow={0.5}
        persistence={0.5}
        mouseStrength={0.5}
        mouseGlow={0.6}
        curvature={0.1}
        vignette={0.25}
        clickEffect={preview ? 'none' : 'glitch'}
        scramble={0.5}
        scanlineIntensity={0.5}
        glitchAmount={1}
        flickerAmount={1}
        noiseAmp={1}
        chromaticAberration={0}
        mouseReact={!preview}
        pageLoadAnimation={!preview}
        pause={preview}
        lightMode={false}
        variation={preview ? 4 : undefined}
        dpr={preview ? 1 : undefined}
      />
    </div>
  );
}
