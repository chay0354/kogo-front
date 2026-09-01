'use client';

import { useEffect, useState } from 'react';

/**
 * The last answer given for each query. A component that remounts — the office
 * layout does, on every navigation — would otherwise assume "not matching" for
 * one frame and lay itself out as a phone before snapping back.
 *
 * Left empty on the server and on the first client render, so the markup React
 * hydrates against is unchanged.
 */
const lastAnswer = new Map<string, boolean>();

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => lastAnswer.get(query) ?? false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => {
      lastAnswer.set(query, media.matches);
      setMatches(media.matches);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

export const LG_MEDIA_QUERY = '(min-width: 1024px)';
export const MD_MEDIA_QUERY = '(min-width: 768px)';
