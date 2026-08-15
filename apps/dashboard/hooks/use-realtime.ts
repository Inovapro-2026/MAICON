'use client';

import { useEffect, useRef, useState } from 'react';
import { realtimeClient, RealtimeStatus } from '@/lib/socket-client';
import { RealtimeEventMessage, RealtimeEventType } from '@/lib/realtime';

/**
 * Hook do WebSocket global (conexão singleton).
 *
 * Uso:
 *   const { status } = useRealtime({
 *     new_message_received: (event) => { ... },
 *     status_changed: (event) => { ... },
 *   });
 *
 * Os handlers podem mudar a cada render; a inscrição é feita uma única vez.
 */
export function useRealtime(handlers?: Partial<Record<RealtimeEventType, (event: RealtimeEventMessage) => void>>) {
  const [status, setStatus] = useState<RealtimeStatus>(realtimeClient.status);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const unsubscribeStatus = realtimeClient.onStatus(setStatus);
    const cleanups: Array<() => void> = [unsubscribeStatus];

    const current = handlersRef.current;
    if (current) {
      for (const [type, handler] of Object.entries(current)) {
        if (typeof handler === 'function') {
          cleanups.push(
            realtimeClient.on(type as RealtimeEventType, (event) => {
              const cb = handlersRef.current?.[type as RealtimeEventType];
              cb?.(event);
            })
          );
        }
      }
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return { status, client: realtimeClient };
}