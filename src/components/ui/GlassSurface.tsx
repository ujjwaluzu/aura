import type { ComponentProps, CSSProperties } from 'react';

interface GlassSurfaceProps extends ComponentProps<'section'> {
  opacity?: number;
  variant?: 'panel' | 'inset';
}

export function GlassSurface({
  className = '',
  opacity = 0.86,
  variant = 'panel',
  style,
  ...props
}: GlassSurfaceProps) {
  return (
    <section
      className={`glass-surface glass-${variant} ${className}`}
      style={{ '--glass-opacity': opacity, ...style } as CSSProperties}
      {...props}
    />
  );
}
