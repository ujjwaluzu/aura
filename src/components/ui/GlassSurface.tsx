import type { ComponentProps, CSSProperties } from 'react';

interface GlassSurfaceProps extends ComponentProps<'section'> {
  opacity?: number;
}

export function GlassSurface({
  className = '',
  opacity = 0.86,
  style,
  ...props
}: GlassSurfaceProps) {
  return (
    <section
      className={`glass-surface ${className}`}
      style={{ '--glass-opacity': opacity, ...style } as CSSProperties}
      {...props}
    />
  );
}
