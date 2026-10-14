import api from '../api';
import { readCounts, type CopiedConversation, type ImportCounts } from './historyFile';

/** The calls of the copy from ManyChat (kogo-back apps/wahub/history.py, `history/import/`). */

const BASE = '/wahub/history/import/';

/** GET — how many conversations were copied so far. */
export async function fetchCopiedCount(): Promise<number> {
  const data = (await api.get(BASE)).data as Record<string, unknown>;
  return typeof data?.copied === 'number' ? data.copied : 0;
}

/** POST — one batch; what the server kept. */
export async function sendHistoryBatch(conversations: CopiedConversation[]): Promise<ImportCounts> {
  return readCounts((await api.post(BASE, { conversations })).data);
}
