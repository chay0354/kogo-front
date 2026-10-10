'use client';

import { useState } from 'react';
import { Bot, ChevronDown } from 'lucide-react';
import type { WahubShadowReply } from '@/types/wahub';
import { ShadowBubble, ShadowWhy, VerdictButtons } from '../bot/shared';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

interface ShadowRowProps {
  reply: WahubShadowReply;
  busy: boolean;
  onVerdict: (verdict: 'good' | 'bad', note: string) => void;
  onOpenItem: (id: number) => void;
}

/**
 * Under a customer's message that has a shadow reply: one folded line,
 * "🤖 הבוט החדש היה עונה…". A press opens the answer, "למה", the tools, the
 * knowledge and 👍/👎. It sits on the bot's side of the conversation, dashed,
 * because it was never sent.
 */
export default function ShadowRow({ reply, busy, onVerdict, onOpenItem }: ShadowRowProps) {
  const [open, setOpen] = useState(false);
  const preview = reply.text.replace(/\s+/g, ' ').trim();
  return (
    <div className={s.shadowRow}>
      {open ? (
        <div className={s.shadowCard} role="region" aria-label="הבוט החדש היה עונה">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-[var(--navy-ink)]" aria-hidden="true" />
            <span className={cx(s.t1, s.navyInk, 'flex-1')}>הבוט החדש היה עונה</span>
            {reply.verdict === 'good' && <span className={cx(s.pill, s.pGood)}>סומן טוב</span>}
            {reply.verdict === 'bad' && <span className={cx(s.pill, s.pBad)}>לתקן</span>}
            <button type="button" onClick={() => setOpen(false)} aria-label="קפל" className={cx(s.ib, s.ibSm)}>
              <ChevronDown className="rotate-180" aria-hidden="true" />
            </button>
          </div>
          <ShadowBubble text={reply.text} model={reply.model} tookMs={reply.took_ms} requestHuman={reply.request_human} requestHumanReason={reply.request_human_reason} heading={null} />
          {reply.old_bot_reply?.text && (
            <p className={cx(s.t2, 'm-0 !text-[12px]')} dir="auto">
              הישן ענה: “{reply.old_bot_reply.text.replace(/\s+/g, ' ').trim()}”
            </p>
          )}
          <ShadowWhy reasoning={reply.reasoning} tools={reply.tools_used} knowledge={reply.knowledge_used} onOpenItem={onOpenItem} />
          <VerdictButtons verdict={reply.verdict} note={reply.verdict_note} busy={busy} onVerdict={onVerdict} />
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className={s.shadowToggle} title="לחיצה פותחת את התשובה, למה, ואת הסימון">
          <Bot aria-hidden="true" />
          <span>הבוט החדש היה עונה…</span>
          {preview && <span className={s.preview}>{preview}</span>}
          {reply.verdict === 'good' && <span aria-label="סומן טוב">👍</span>}
          {reply.verdict === 'bad' && <span aria-label="לתקן">👎</span>}
        </button>
      )}
    </div>
  );
}
