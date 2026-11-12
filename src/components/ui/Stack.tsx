import type { ComponentProps } from 'react';

export function Stack({ className = '', ...props }: ComponentProps<'div'>) {
  return <div className={`flex flex-col gap-4 ${className}`} {...props} />;
}
