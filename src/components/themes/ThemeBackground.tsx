import { useEffect, useRef, useState } from 'react';
import { AppErrorBoundary } from '../ui/AppErrorBoundary';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import FaultyTerminal from './FaultyTerminal';
import Galaxy from './Galaxy';
import LetterGlitch from './LetterGlitch';
import PixelSnow from './PixelSnow';
import type { ThemeId } from '../../features/themes/catalog';

type ThemeBackgroundProps = { theme: ThemeId; preview?: boolean };

/** Shared by live pages and paused thumbnails; OS motion changes take effect immediately. */
export function ThemeBackground(props: ThemeBackgroundProps) {
  const reducedMotion = useReducedMotion();
  return (
    <ThemeSurface
      key={`${props.theme}:${reducedMotion}`}
      {...props}
      reducedMotion={reducedMotion}
    />
  );
}

function ThemeSurface({
  theme,
  preview = false,
  reducedMotion,
}: ThemeBackgroundProps & { reducedMotion: boolean }) {
  const still = preview || reducedMotion;
  const ref = useRef<HTMLDivElement>(null);
  const [lost, setLost] = useState(false);
  useEffect(() => {
    const container = ref.current;
    const onLost = (event: Event) => {
      event.preventDefault();
      setLost(true);
    };
    container?.addEventListener('webglcontextlost', onLost, true);
    return () =>
      container?.removeEventListener('webglcontextlost', onLost, true);
  }, []);
  return (
    <div ref={ref} className="theme-background" aria-hidden="true">
      {!lost && (
        <AppErrorBoundary fallback={null}>
          {theme === 'galaxy' ? (
            <Galaxy
              density={1}
              glowIntensity={0.3}
              flareIntensity={1}
              starSpeed={0.5}
              mouseRepulsion
              clickWarp={!still}
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
              mouseInteraction={!still}
              intro={!still}
              disableAnimation={still}
              lightMode={false}
              dpr={preview ? 1 : undefined}
            />
          ) : theme === 'letter-glitch' ? (
            <LetterGlitch
              glitchColors={['#ffffff', '#61dca3']}
              glitchAmount={0.5}
              speed={still ? 0 : 1}
              flow={0.5}
              clickEffect={still ? 'none' : 'tear'}
              baseColor="#ffffff"
              fontSize={14}
              spacing={0.6}
              density={0.9}
              baseOpacity={0.16}
              smooth
              edgeFade={0}
              centerFade={0}
              interactive={!still}
              cursorRadius={140}
              intro={!still}
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
              mouseInteraction={!still}
              sway={0.5}
              twinkle={0.35}
              accumulate={false}
              depth={0.6}
              brightness={1}
              fade={0}
              opacity={1}
              intro={!still}
              lightMode={false}
              paused={still}
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
              clickEffect={still ? 'none' : 'glitch'}
              scramble={0.5}
              scanlineIntensity={0.5}
              glitchAmount={1}
              flickerAmount={1}
              noiseAmp={1}
              chromaticAberration={0}
              mouseReact={!still}
              pageLoadAnimation={!still}
              pause={still}
              lightMode={false}
              variation={preview ? 4 : undefined}
              dpr={preview ? 1 : undefined}
            />
          )}
        </AppErrorBoundary>
      )}
    </div>
  );
}
