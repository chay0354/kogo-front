'use client';

/**
 * The results of a broadcast, as they come in: who did not get it on top, in
 * red, with the reason in plain words and what to do; who may not have (free
 * text, which WhatsApp holds back outside the 24-hour window) under it, in
 * amber; and everyone who got it folded away below. See lib/broadcastOutcome.
 */
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, XCircle } from 'lucide-react';
import LinkContactPanel, { localPhone } from '@/components/broadcast/LinkContactPanel';
import { plainReason, splitOutcome, type Recipient } from '@/lib/broadcastOutcome';
import type { BroadcastRow } from '@/lib/whatsappApi';

// Names shown before "show all" in the long lists.
const FOLDED_NAMES = 12;

interface Props {
  rows: BroadcastRow[];
  /** The run has ended; while it is still sending, the lists say "so far". */
  finished: boolean;
  /** The child's name as the office picked it, falling back to the row's. */
  nameFor: (childId: string, fallback: string) => string;
  /** Phones linked by hand in this run, with the ManyChat name. */
  linked: Record<string, string>;
  onLinked: (phone: string, displayName: string) => void;
  /** A skip reason in words. */
  skipLabel: (reason: string | null) => string;
}

function Who({ r, nameFor }: { r: Recipient; nameFor: Props['nameFor'] }) {
  return (
    <span className="min-w-0">
      <span className="font-medium">{nameFor(r.childId, r.childName)}</span>
      {r.parentName && <span className="text-muted-foreground"> · {r.parentName}</span>}
      {r.extra && <span className="text-muted-foreground"> · הורה נוסף</span>}
      {r.phone && (
        <>
          <span className="text-muted-foreground"> · </span>
          <span className="tabular-nums text-muted-foreground" dir="ltr">
            {localPhone(r.phone)}
          </span>
        </>
      )}
    </span>
  );
}

function Folded({
  title,
  items,
  render,
  tone,
}: {
  title: string;
  items: Recipient[];
  render: (r: Recipient) => React.ReactNode;
  tone: string;
}) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="rounded-lg border text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-right ${tone}`}
        aria-expanded={open}
      >
        <span className="font-medium">
          {title} ({items.length})
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="max-h-56 overflow-y-auto divide-y border-t">
          {items.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
              {render(r)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BroadcastOutcomePanel({ rows, finished, nameFor, linked, onLinked, skipLabel }: Props) {
  const [allFreeText, setAllFreeText] = useState(false);
  const { failed, freeText, delivered, skipped } = splitOutcome(rows);
  const soFar = finished ? '' : ' — עד עכשיו';
  const shownFreeText = allFreeText ? freeText : freeText.slice(0, FOLDED_NAMES);

  return (
    <div className="space-y-3">
      {failed.length > 0 ? (
        <section className="rounded-lg border border-red-300 bg-red-50 text-sm text-red-950" aria-live="polite">
          <h3 className="flex items-center gap-2 px-3 pt-3 font-semibold">
            <XCircle className="h-4 w-4 shrink-0" />
            לא קיבלו ({failed.length}){soFar}
          </h3>
          <ul className="max-h-80 overflow-y-auto divide-y divide-red-200 px-3 pb-2">
            {failed.map((r) => {
              const reason = plainReason(r);
              return (
                <li key={r.key} className="space-y-1 py-2">
                  <Who r={r} nameFor={nameFor} />
                  <p className="font-medium text-red-800">{reason.why}</p>
                  <p className="text-xs">מה לעשות: {reason.action}</p>
                  {/* ManyChat's own words, for whoever needs them — except the
                      "cannot find" one, which the line above already says. */}
                  {r.error && r.error !== r.reason && r.reason !== 'contact_unfindable' && (
                    <p className="text-[11px] text-red-900/70" dir="auto">
                      {r.error}
                    </p>
                  )}
                  {r.reason === 'contact_unfindable' && r.phone && (
                    <LinkContactPanel
                      phone={r.phone}
                      linkedAs={linked[r.phone]}
                      onLinked={(displayName) => onLinked(r.phone, displayName)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        (delivered.length > 0 || freeText.length > 0) && (
          <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {finished ? 'אף הודעה לא נכשלה.' : 'עד עכשיו אף הודעה לא נכשלה.'}
          </p>
        )
      )}

      {freeText.length > 0 && (
        <section className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <h3 className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            ייתכן שלא הגיע ({freeText.length}){soFar}
          </h3>
          <p className="text-xs">
            נשלח כטקסט חופשי, כי אין להודעה הזו אוטומציה ב-ManyChat. וואטסאפ מוסר טקסט חופשי רק למי שכתב לעסק ב-24
            השעות האחרונות — לשאר ההודעה לא מגיעה. כדי שתגיע לכולם צריך ב-ManyChat אוטומציה עם תבנית.
          </p>
          <p className="text-xs leading-6">
            {shownFreeText.map((r, index) => (
              <span key={r.key}>
                {index > 0 && ', '}
                {nameFor(r.childId, r.childName)}
                {r.parentName ? ` (${r.parentName})` : ''}
              </span>
            ))}
            {freeText.length > FOLDED_NAMES && (
              <button type="button" className="mr-2 underline" onClick={() => setAllFreeText((v) => !v)}>
                {allFreeText ? 'פחות' : `ועוד ${freeText.length - FOLDED_NAMES}`}
              </button>
            )}
          </p>
        </section>
      )}

      <Folded
        title="קיבלו"
        items={delivered}
        tone="text-emerald-800"
        render={(r) => (
          <>
            <Who r={r} nameFor={nameFor} />
            <span className="shrink-0 text-emerald-700">נשלח</span>
          </>
        )}
      />
      <Folded
        title="דולגו"
        items={skipped}
        tone="text-muted-foreground"
        render={(r) => (
          <>
            <Who r={r} nameFor={nameFor} />
            <span className="shrink-0 text-muted-foreground">{skipLabel(r.reason)}</span>
          </>
        )}
      />
    </div>
  );
}
