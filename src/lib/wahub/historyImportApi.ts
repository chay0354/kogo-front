import api from '../api';
import { readCounts, type CopiedConversation, type ImportCounts } from './historyBridge';

/** The calls of the copy from ManyChat (kogo-back apps/wahub/history.py, `history/import/`). */

const BASE = '/wahub/history/import/';

export interface StillToCopy {
  switchedAt: string;
  /** ManyChat's numbers of the conversations to bring, the latest first. */
  subscribers: string[];
}

/** GET — the conversations that began before the switch and were not copied yet (`again`: all of them). */
export async function fetchStillToCopy(again = false): Promise<StillToCopy> {
  const data = (await api.get(BASE, { params: again ? { again: '1' } : {} })).data as Record<string, unknown>;
  const subscribers = Array.isArray(data?.subscribers) ? data.subscribers.map(String).filter((id) => /^\d+$/.test(id)) : [];
  return { switchedAt: typeof data?.switched_at === 'string' ? data.switched_at : '', subscribers };
}

/** POST — one batch; what the server kept. */
export async function sendHistoryBatch(conversations: CopiedConversation[]): Promise<ImportCounts> {
  return readCounts((await api.post(BASE, { conversations })).data);
}
