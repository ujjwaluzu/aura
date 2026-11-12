import type { ReactNode } from 'react';

export function Text({
  children,
  tone = 'secondary',
  className = '',
}: {
  children: ReactNode;
  tone?: 'primary' | 'secondary' | 'muted';
  className?: string;
}) {
  return <p className={`text-${tone} ${className}`}>{children}</p>;
}
