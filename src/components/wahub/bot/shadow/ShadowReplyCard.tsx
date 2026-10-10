'use client';

import { MessageSquare } from 'lucide-react';
import { formatDateTime } from '@/lib/wahub/format';
import type { WahubShadowReply } from '@/types/wahub';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import { ShadowBubble, ShadowWhy, VerdictButtons } from '../shared';

interface ShadowReplyCardProps {
  reply: WahubShadowReply;
  now: Date;
  busy: boolean;
  /** Said when the card is shown away from its conversation. */
  showContact?: boolean;
  onVerdict: (verdict: 'good' | 'bad', note: string) => void;
  onOpenItem?: (id: number) => void;
  onOpenChat?: (contactId: number) => void;
}

/**
 * One shadow reply, the whole story: the customer's message when the server
 * gave it, what the old bot answered, what the new one would have answered,
 * "why" folded, and 👍/👎.
 */
export default function ShadowReplyCard({ reply, now, busy, showContact = false, onVerdict, onOpenItem, onOpenChat }: ShadowReplyCardProps) {
  const contactName = reply.contact_name || (reply.contact_id ? `שיחה ${reply.contact_id}` : '');
  const contactId = reply.contact_id ?? null;
  return (
    <article className={cx(s.card, 'flex flex-col gap-3')} aria-label={`הצעת הבוט החדש${contactName ? ` ל${contactName}` : ''}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {showContact && (
          <p className={cx(s.t1, 'm-0 min-w-0 truncate')} dir="auto">
            {contactName || 'שיחה'}
          </p>
        )}
        <span className={cx(s.t2, s.num)}>{formatDateTime(reply.created_at, now)}</span>
        <span className="flex-1" />
        {contactId != null && onOpenChat && (
          <button type="button" onClick={() => onOpenChat(contactId)} className={cx(s.btn, s.btnSm)}>
            <MessageSquare aria-hidden="true" />
            פתח שיחה
          </button>
        )}
      </header>

      {reply.customer_text && (
        <div className={s.bubbleRow}>
          <div className={s.bubbleCol}>
            <div className={cx(s.bubble, s.bCustomer)}>
              <p className={s.bubbleMeta}>
                <span>הלקוח</span>
                {(reply.covers_message_ids?.length ?? 0) > 1 && <span>· {reply.covers_message_ids!.length} הודעות ברצף</span>}
              </p>
              <p className={s.bubbleText} dir="auto">
                {reply.customer_text}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className={s.pair}>
        <div className={s.pairCol}>
          <h4>הישן ענה</h4>
          {reply.old_bot_reply?.text ? (
            <p className={s.pairText} dir="auto">
              {reply.old_bot_reply.text}
            </p>
          ) : (
            <p className={cx(s.pairText, s.muted)}>לא ענה (או שהתשובה לא הגיעה לכאן)</p>
          )}
        </div>
        <div className={cx(s.pairCol, '!border-dashed !border-[var(--navy)]')}>
          <h4>החדש היה עונה</h4>
          <ShadowBubble text={reply.text} model={reply.model} tookMs={reply.took_ms} requestHuman={reply.request_human} requestHumanReason={reply.request_human_reason} heading={null} />
        </div>
      </div>

      <ShadowWhy reasoning={reply.reasoning} tools={reply.tools_used} knowledge={reply.knowledge_used} onOpenItem={onOpenItem} />

      <VerdictButtons verdict={reply.verdict} note={reply.verdict_note} busy={busy} onVerdict={onVerdict} />
    </article>
  );
}
