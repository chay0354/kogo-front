'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import { isDemoContact, suggestDemoPhone } from '@/lib/wahub/demo';
import {
  createWahubContact,
  createWahubDemoScenario,
  deleteWahubDemoContacts,
  existingContactId,
  fetchWahubContacts,
  fetchWahubDemoScenarios,
} from '@/lib/wahubApi';
import type { WahubDemoScenario } from '@/types/wahub';
import { EmptyState, ErrorState, InlineConfirm, Pill, Skeleton, Spinner } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';

const demoKeys = {
  scenarios: ['wahub', 'demo', 'scenarios'] as const,
  contacts: ['wahub', 'demo', 'contacts'] as const,
};

interface DemoTabProps {
  onOpenChat: (contactId: number) => void;
  /** Contacts were made or removed outside the live update: every list reads itself again. */
  onDemoChanged: () => void;
}

function NewDemoContact({ taken, onCreated }: { taken: string[]; onCreated: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [existingId, setExistingId] = useState<number | null>(null);

  function start() {
    setPhone(suggestDemoPhone(taken));
    setName('');
    setError('');
    setExistingId(null);
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!phone.replace(/\D/g, '').length || saving) return;
    setSaving(true);
    setError('');
    setExistingId(null);
    try {
      const contact = await createWahubContact({ phone, name, isDemo: true });
      toast.success(`נוצר לקוח דמו${contact.name ? `: ${contact.name}` : ''}`);
      setOpen(false);
      onCreated(contact.id);
    } catch (failure) {
      const existing = existingContactId(failure);
      if (existing) {
        setExistingId(existing);
        setError('הטלפון הזה כבר קיים ברשימה.');
      } else {
        setError(readableError(failure, 'לקוח הדמו לא נוצר'));
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={start} className={cx(s.btn, s.btnP)}>
        <UserPlus aria-hidden="true" />
        לקוח דמו חדש
      </button>
    );
  }

  return (
    <form onSubmit={submit} className={cx(s.inset, 'flex flex-col gap-3')} aria-label="לקוח דמו חדש">
      <div className={s.form}>
        <label>
          שם
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus placeholder="למשל: הדס מלמד" />
        </label>
        <label>
          טלפון (050-555 ואז ארבע ספרות)
          <input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={s.fieldLtr} />
        </label>
      </div>
      {error && (
        <div role="alert" className={s.noteBad}>
          <p className="m-0">{error}</p>
          {existingId && (
            <button type="button" onClick={() => onCreated(existingId)} className={cx(s.link, s.badText, 'mt-1')}>
              פתח את השיחה הקיימת
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || !phone.trim()} className={cx(s.btn, s.btnSm, s.btnP)}>
          {saving && <Spinner className="h-3.5 w-3.5" />}
          צור ופתח שיחה
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={saving} className={cx(s.btn, s.btnSm)}>
          ביטול
        </button>
      </div>
    </form>
  );
}

/**
 * "דמו": invented customers, so the owner can watch the system live before
 * anything is connected — tagging, summary, cross-check, the shadow bot's
 * answers and its proposals. A demo contact never receives a message.
 */
export default function DemoTab({ onOpenChat, onDemoChanged }: DemoTabProps) {
  const queryClient = useQueryClient();
  const scenarios = useQuery({ queryKey: demoKeys.scenarios, queryFn: fetchWahubDemoScenarios, staleTime: 5 * 60_000, retry: false });
  // The phones already in use, so a suggested demo number is free; and how many demo contacts there are.
  const contacts = useQuery({
    queryKey: demoKeys.contacts,
    queryFn: () => fetchWahubContacts({ view: 'chats', pageSize: 100 }),
    staleTime: 30_000,
    retry: false,
  });
  const [creating, setCreating] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const phones = useMemo(() => (contacts.data?.results ?? []).map((contact) => contact.phone), [contacts.data]);
  const demoCount = useMemo(() => (contacts.data?.results ?? []).filter(isDemoContact).length, [contacts.data]);

  function changed() {
    onDemoChanged();
    void queryClient.invalidateQueries({ queryKey: demoKeys.contacts });
    void queryClient.invalidateQueries({ queryKey: ['wahub', 'summary'] });
    void queryClient.invalidateQueries({ queryKey: ['wahub', 'shadow'] });
    void queryClient.invalidateQueries({ queryKey: ['wahub', 'review'] });
  }

  async function create(scenario: WahubDemoScenario) {
    if (creating) return;
    setCreating(scenario.key);
    try {
      const contact = await createWahubDemoScenario(scenario.key);
      toast.success(`נוצר: ${scenario.title}${contact.name ? ` (${contact.name})` : ''}`);
      changed();
      if (contact.id) onOpenChat(contact.id);
    } catch (error) {
      toast.error(readableError(error, 'התרחיש לא נוצר'));
    } finally {
      setCreating(null);
    }
  }

  async function removeAll() {
    setDeleting(true);
    try {
      const result = await deleteWahubDemoContacts();
      toast.success(result.deleted != null ? `נמחקו ${result.deleted} לקוחות דמו` : 'לקוחות הדמו נמחקו');
      setConfirmingDelete(false);
      changed();
    } catch (error) {
      toast.error(readableError(error, 'המחיקה נכשלה'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <p className={cx(s.strip, 'm-0')} role="status" style={{ background: 'var(--gold-bg)', color: 'var(--gold-ink)' }}>
        <FlaskConical aria-hidden="true" />
        לקוחות דמו לא מקבלים שום הודעה, גם כשהשליחה דלוקה. הם מסומנים “דמו” בכל מקום, ואפשר למחוק את כולם בלחיצה.
      </p>

      <section className={cx(s.card, 'flex flex-col gap-3')} aria-label="לקוח דמו חדש">
        <div className="flex flex-wrap items-start gap-3">
          <span aria-hidden="true" className={s.iconBox}>
            <UserPlus className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-extrabold">לקוח דמו חדש</h3>
            <p className={cx(s.t2, 'm-0 !text-[12.5px]')}>
              שם וטלפון, ואז בשיחה כותבים “כלקוח” ו“כבוט הישן” ורואים מה המערכת עושה. {demoCount > 0 ? `יש כרגע ${demoCount} לקוחות דמו ברשימה.` : ''}
            </p>
          </div>
        </div>
        <NewDemoContact
          taken={phones}
          onCreated={(id) => {
            changed();
            onOpenChat(id);
          }}
        />
      </section>

      <section className={cx(s.card, s.cardFlush)} aria-label="תרחישים מוכנים">
        <div className={s.kindHead}>
          <div className="min-w-0 flex-1">
            <h3>תרחישים מוכנים</h3>
            <p>שיחה שלמה שכבר עברה סיכום, הצלבה ותשובה בצל – לחיצה אחת, והיא נפתחת.</p>
          </div>
        </div>
        {scenarios.isLoading ? (
          <div className="flex flex-col gap-2 p-4" aria-busy="true">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : scenarios.isError ? (
          <ErrorState title="לא הצלחנו לטעון את התרחישים" text={readableError(scenarios.error, '')} onRetry={() => void scenarios.refetch()} tight />
        ) : (scenarios.data ?? []).length === 0 ? (
          <EmptyState icon={<FlaskConical />} title="אין תרחישים מוכנים" tight />
        ) : (
          <ul className="m-0 list-none p-0">
            {(scenarios.data ?? []).map((scenario) => (
              <li key={scenario.key} className={cx(s.kRow, 'cursor-default items-center')}>
                <div className="min-w-0 flex-1">
                  <p className={cx(s.t1, 'm-0')} dir="auto">
                    {scenario.title}
                  </p>
                  {scenario.description && (
                    <p className={cx(s.t2, 'm-0 mt-0.5 !text-[12.5px] leading-relaxed')} dir="auto">
                      {scenario.description}
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => void create(scenario)} disabled={Boolean(creating)} className={cx(s.btn, s.btnSm, s.btnP)}>
                  {creating === scenario.key ? <Spinner className="h-3.5 w-3.5" /> : <Plus aria-hidden="true" />}
                  צור
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cx(s.card, 'flex flex-col gap-3')} aria-label="מחיקת הדמו">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-extrabold">ניקוי</h3>
            <p className={cx(s.t2, 'm-0 !text-[12.5px]')}>מוחק את כל לקוחות הדמו עם השיחות שלהם. לקוחות אמיתיים לא נוגעים.</p>
          </div>
          {demoCount > 0 && <Pill tone="gold">{demoCount} דמו</Pill>}
          {!confirmingDelete && (
            <button type="button" onClick={() => setConfirmingDelete(true)} className={cx(s.btn, s.btnBad)}>
              <Trash2 aria-hidden="true" />
              מחק את כל הדמו
            </button>
          )}
        </div>
        {confirmingDelete && (
          <InlineConfirm
            danger
            text={
              <>
                למחוק את <strong className="font-extrabold">כל</strong> לקוחות הדמו והשיחות שלהם? הצעות הצל שלהם נמחקות איתם. לקוחות אמיתיים נשארים.
              </>
            }
            confirmLabel="כן, מחק את כל הדמו"
            busy={deleting}
            onConfirm={() => void removeAll()}
            onCancel={() => setConfirmingDelete(false)}
          />
        )}
      </section>
    </div>
  );
}
