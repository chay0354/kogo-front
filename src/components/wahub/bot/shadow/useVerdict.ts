'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import { setWahubShadowVerdict } from '@/lib/wahubApi';
import type { WahubShadowReply } from '@/types/wahub';
import { useShadowCache } from '../../hooks/useBotQueries';

/** Save a verdict: shown at once, taken back if the server refuses. Shared with the conversation's rows. */
export function useVerdict() {
  const cache = useShadowCache();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function verdict(reply: WahubShadowReply, value: 'good' | 'bad', note: string) {
    setBusyId(reply.id);
    cache.patch(reply.id, (prev) => ({ ...prev, verdict: value, verdict_note: value === 'bad' ? note : '' }));
    try {
      const saved = await setWahubShadowVerdict(reply.id, { verdict: value, note });
      // The answer comes without the contact's name and text; the copy on screen keeps them.
      if (saved) cache.patch(reply.id, (prev) => ({ ...prev, ...saved, contact_id: prev.contact_id, contact_name: prev.contact_name, customer_text: prev.customer_text }));
      cache.invalidateSummary();
      if (saved?.proposal_id) toast.success('נרשם לתיקון. נוצרה הצעת עדכון – ראו את הכפתור הצף.');
      else if (value === 'bad' && note.trim()) toast.success('נרשם לתיקון.');
    } catch (error) {
      cache.patch(reply.id, () => reply);
      toast.error(readableError(error, 'הסימון לא נשמר'));
    } finally {
      setBusyId(null);
    }
  }

  return { verdict, busyId };
}
