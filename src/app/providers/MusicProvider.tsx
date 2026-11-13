import type { ReactNode } from 'react';
import { MusicContext, useMusicState } from '../../hooks/useMusic';
export function MusicProvider({ children }: { children: ReactNode }) {
  const music = useMusicState();
  return (
    <MusicContext.Provider value={music}>{children}</MusicContext.Provider>
  );
}
