import { useEffect, useState } from 'react';
import { errorMessage, getFoundationInfo, isDesktop } from '../lib/native';
import type { FoundationInfo } from '../types/native';

type Connection =
  | { status: 'preview' | 'connecting'; info?: never; error?: never }
  | { status: 'connected'; info: FoundationInfo; error?: never }
  | { status: 'error'; error: string; info?: never };

export function useNativeConnection() {
  const [connection, setConnection] = useState<Connection>({
    status: isDesktop() ? 'connecting' : 'preview',
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    if (isDesktop()) {
      void getFoundationInfo().then(
        (info) => {
          if (active) setConnection({ status: 'connected', info });
        },
        (error: unknown) => {
          if (active)
            setConnection({ status: 'error', error: errorMessage(error) });
        },
      );
    }
    return () => {
      active = false;
    };
  }, [attempt]);

  const reconnect = () => {
    if (!isDesktop()) return;
    setConnection({ status: 'connecting' });
    setAttempt((value) => value + 1);
  };

  return { connection, reconnect };
}
