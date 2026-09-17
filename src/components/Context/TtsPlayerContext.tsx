import React, { createContext, useContext } from 'react';

import { TtsPlayerApi, useTtsPlayer } from '@hooks/useTtsPlayer';

const defaultValue = {} as TtsPlayerApi;
const TtsPlayerContext = createContext<TtsPlayerApi>(defaultValue);

/**
 * Mounted above the navigator so the queue outlives the reader: leaving the
 * reader, or locking the screen, must not interrupt playback.
 */
export function TtsPlayerContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const player = useTtsPlayer();

  return (
    <TtsPlayerContext.Provider value={player}>
      {children}
    </TtsPlayerContext.Provider>
  );
}

export const useTtsPlayerContext = (): TtsPlayerApi =>
  useContext(TtsPlayerContext);
