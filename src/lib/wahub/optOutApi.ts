import api from '../api';
import type { WahubContact } from '@/types/wahub';
import { readActionContact } from './futureLeads';

/**
 * The two calls of "ביקש הסר" (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.1.4). Neither sends anything to anybody
 * and neither reaches ManyChat: they write one line of the system's own list, and the log. Both answer with the
 * contact as it now stands; a second press changes nothing and answers the same, so a retry is safe.
 */

const BASE = '/wahub';

function contactOrThrow(raw: unknown): WahubContact {
  const contact = readActionContact(raw);
  if (!contact) throw new Error('the answer names no contact');
  return contact;
}

/** POST contacts/{id}/opt-out/ — "ביקש הסר": no broadcast goes out to this number from now on. */
export async function optOutWahubContact(id: number): Promise<WahubContact> {
  const res = await api.post(`${BASE}/contacts/${id}/opt-out/`);
  return contactOrThrow(res.data);
}

/** POST contacts/{id}/opt-in/ — "ביקש לחזור לתפוצה". The list keeps who brought them back, and when. */
export async function optInWahubContact(id: number): Promise<WahubContact> {
  const res = await api.post(`${BASE}/contacts/${id}/opt-in/`);
  return contactOrThrow(res.data);
}
