import FaultyTerminal from './FaultyTerminal';
import Galaxy from './Galaxy';
import LetterGlitch from './LetterGlitch';
import PixelSnow from './PixelSnow';
import type { ThemeId } from '../../features/themes/catalog';

/** Shared by the live widget pages and the settings thumbnails. */
export function ThemeBackground({
  theme,
  preview = false,
}: {
  theme: ThemeId;
  preview?: boolean;
}) {
  return (
    <div className="theme-background" aria-hidden="true">
      {theme === 'galaxy' ? (
        <Galaxy
          density={1}
          glowIntensity={0.3}
          flareIntensity={1}
          starSpeed={0.5}
          mouseRepulsion
          clickWarp={!preview}
          starColors={[]}
          hueShift={140}
          saturation={0}
          starSize={1}
          twinkleIntensity={0.3}
          speed={1}
          rotationSpeed={0.1}
          layers={4}
          direction="forward"
          repulsionStrength={2}
          mouseInteraction={!preview}
          intro={!preview}
          disableAnimation={preview}
          lightMode={false}
          dpr={preview ? 1 : undefined}
        />
      ) : theme === 'letter-glitch' ? (
        <LetterGlitch
          glitchColors={['#ffffff', '#61dca3']}
          glitchAmount={0.5}
          speed={preview ? 0 : 1}
          flow={0.5}
          clickEffect={preview ? 'none' : 'tear'}
          baseColor="#ffffff"
          fontSize={14}
          spacing={0.6}
          density={0.9}
          baseOpacity={0.16}
          smooth
          edgeFade={0}
          centerFade={0}
          interactive={!preview}
          cursorRadius={140}
          intro={!preview}
          lightMode={false}
          dpr={preview ? 1 : undefined}
        />
      ) : theme === 'pixel-snow' ? (
        <PixelSnow
          color="#ffffff"
          variant="snowflake"
          density={0.5}
          speed={1}
          wind={0.25}
          flakeSize={1}
          pixelSize={3}
          glow={0.8}
          mouseInteraction={!preview}
          sway={0.5}
          twinkle={0.35}
          accumulate={false}
          depth={0.6}
          brightness={1}
          fade={0}
          opacity={1}
          intro={!preview}
          lightMode={false}
          paused={preview}
          dpr={preview ? 1 : undefined}
        />
      ) : (
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
      )}
    </div>
  );
}
