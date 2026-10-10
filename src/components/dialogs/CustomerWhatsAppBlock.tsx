'use client';

import { useId, useRef, useState } from 'react';
import { ExternalLink, MessageCircle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { readableError } from '@/lib/apiError';
import { formatDateTime, formatShortDate } from '@/lib/wahub/format';
import { buildWahubUrl } from '@/lib/wahub/params';
import { lastMessageWho, leadName, leadPhone } from '@/lib/wahub/unregistered';
import { fetchWahubForCustomer, recheckWahubForCustomer } from '@/lib/wahubApi';
import type { WahubForCustomer, WahubForCustomerContact } from '@/types/wahub';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/** The address of the full conversation: the server's, or the section's own when it sent none. */
function conversationLink(contact: Pick<WahubForCustomerContact, 'id' | 'link'>): string {
  return (
    contact.link ||
    buildWahubUrl({ tab: 'chats', contact: contact.id, box: 'all', queue: 'all', sub: 'knowledge', item: null })
  );
}

function ContactCard({ contact, now }: { contact: WahubForCustomerContact; now: Date }) {
  const who = lastMessageWho(contact);
  const name = leadName(contact);
  const phone = leadPhone(contact);
  const showPhone = Boolean((contact.name || '').trim()) && Boolean(phone);
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="font-medium" dir="auto">
            {name}
          </span>
          {showPhone && (
            <span className="text-muted-foreground text-sm select-all" dir="ltr">
              {phone}
            </span>
          )}
          {contact.is_demo && (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900" title="לקוח דמו – לא מקבל שום הודעה">
              דמו
            </Badge>
          )}
          <Badge variant={contact.linked ? 'default' : 'outline'}>
            {contact.linked ? 'מקושר לכרטיס הזה' : 'לא מקושר'}
          </Badge>
        </div>
        <a
          href={conversationLink(contact)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
        >
          לשיחה המלאה
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">{contact.handled_by === 'human' ? 'נציג עונה' : 'הבוט עונה'}</Badge>
        {contact.needs_human && <Badge variant="destructive">מבקש נציג</Badge>}
        {contact.followup_status_label && (
          <Badge variant="outline">
            מעקב: {contact.followup_status_label}
            {contact.followup_due ? ` · ${formatShortDate(contact.followup_due.slice(0, 10), now)}` : ''}
          </Badge>
        )}
        {contact.kogo_outcome_label && <Badge variant="outline">{contact.kogo_outcome_label}</Badge>}
      </div>

      {contact.last_message_text ? (
        <p className="text-sm">
          <span className="text-muted-foreground">
            הודעה אחרונה{who ? ` מ${who}` : ''}
            {contact.last_message_at ? ` · ${formatDateTime(contact.last_message_at, now)}` : ''}:
          </span>{' '}
          <span dir="auto" className="whitespace-pre-line">
            {contact.last_message_text}
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">עוד אין הודעות בשיחה הזאת.</p>
      )}

      {contact.known_summary && (
        <p className="text-sm">
          <span className="text-muted-foreground">מה ידוע:</span> <span dir="auto">{contact.known_summary}</span>
        </p>
      )}
    </article>
  );
}

/**
 * What the block shows once the server has answered: the family's WhatsApp
 * contacts, or that there are none, and "בדוק שוב". Kept apart from the loading
 * so it can be read with data alone.
 */
export function CustomerWhatsAppContacts({
  data,
  rechecking,
  onRecheck,
  now = new Date(),
}: {
  data: WahubForCustomer;
  rechecking: boolean;
  onRecheck: () => void;
  now?: Date;
}) {
  return (
    <div className="space-y-3">
      {data.contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין שיחות וואטסאפ למשפחה הזאת.</p>
      ) : (
        <div className="space-y-2">
          {data.contacts.map((contact) => (
            <ContactCard key={contact.id} contact={contact} now={now} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {data.phones.length > 0
            ? `${data.phones.length} ${data.phones.length === 1 ? 'טלפון נבדק' : 'טלפונים נבדקו'}`
            : 'אין טלפון בכרטיס'}
          {data.checked_at ? ` · ${formatDateTime(data.checked_at, now)}` : ''}
        </span>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" disabled={rechecking} onClick={onRecheck}>
          <RefreshCw className={`h-3.5 w-3.5 ${rechecking ? 'animate-spin' : ''}`} aria-hidden="true" />
          {rechecking ? 'בודק…' : 'בדוק שוב'}
        </Button>
      </div>
    </div>
  );
}

/**
 * The "וואטסאפ" line on a customer's card (stage 3, §ג.2). Closed by default,
 * and nothing is asked of the server until it is opened; a press reads the
 * family's conversations by every phone on the card. "בדוק שוב" runs the
 * cross-check against Kogo again. Nothing here sends a message.
 */
export default function CustomerWhatsAppBlock({ familyId }: { familyId: string }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>('idle');
  const [data, setData] = useState<WahubForCustomer | null>(null);
  const [error, setError] = useState('');
  const [rechecking, setRechecking] = useState(false);
  const request = useRef(0);

  const load = async (mode: 'read' | 'recheck') => {
    const current = ++request.current;
    if (mode === 'read') setState('loading');
    else setRechecking(true);
    setError('');
    try {
      const next = mode === 'read' ? await fetchWahubForCustomer(familyId) : await recheckWahubForCustomer(familyId);
      if (current !== request.current) return;
      setData(next);
      setState('ready');
    } catch (err: unknown) {
      if (current !== request.current) return;
      const text = readableError(err, 'לא הצלחנו לקרוא את השיחות. נסו שוב.');
      if (mode === 'read') {
        setState('error');
        setError(text);
      } else {
        setError(`הבדיקה מחדש נכשלה: ${text}`);
      }
    } finally {
      if (current === request.current && mode === 'recheck') setRechecking(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && state === 'idle') void load('read');
  };

  return (
    <>
      <div className="flex justify-between gap-4 items-center">
        <span className="text-muted-foreground text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          וואטסאפ
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          {open ? 'הסתר' : 'הצג שיחות'}
        </Button>
      </div>
      {open && (
        <div id={panelId} className="rounded-lg border border-gray-200 bg-muted/30 p-3">
          {state === 'loading' && (
            <div className="space-y-2" aria-busy="true" aria-label="טוען">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          )}
          {state === 'error' && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm text-destructive">
              <span>{error}</span>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void load('read')}>
                נסו שוב
              </Button>
            </div>
          )}
          {state === 'ready' && data && (
            <>
              {error && (
                <p role="alert" className="mb-2 text-xs text-destructive">
                  {error}
                </p>
              )}
              <CustomerWhatsAppContacts data={data} rechecking={rechecking} onRecheck={() => void load('recheck')} />
            </>
          )}
        </div>
      )}
    </>
  );
}
