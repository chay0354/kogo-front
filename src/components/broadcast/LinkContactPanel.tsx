'use client';

/**
 * Link a parent to their ManyChat contact, from the broadcast row that failed.
 *
 * The contact exists in ManyChat — the parent wrote to the business on
 * WhatsApp — but ManyChat's API has no search by WhatsApp number, so nothing
 * the server tries reaches them. The office finds the contact in ManyChat,
 * where searching by number does work, and pastes its address here once.
 */
import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readableError } from '@/lib/apiError';
import { linkManyChatContact } from '@/lib/whatsappApi';

/** 972501234567 → 050-1234567, the way the number is typed into ManyChat's search. */
export function localPhone(phone: string) {
  const digits = (phone || '').replace(/\D/g, '');
  const local = digits.startsWith('972') ? `0${digits.slice(3)}` : digits;
  return local.length === 10 ? `${local.slice(0, 3)}-${local.slice(3)}` : local;
}

interface Props {
  phone: string;
  linkedAs?: string;
  onLinked: (displayName: string) => void;
}

export default function LinkContactPanel({ phone, linkedAs, onLinked }: Props) {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (linkedAs !== undefined) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-800">
        <Check className="h-3.5 w-3.5 shrink-0" />
        קושר{linkedAs ? ` ל-${linkedAs}` : ''} — ההודעה הבאה למספר הזה תגיע אליו.
      </p>
    );
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>
        <Link2 className="h-3.5 w-3.5 ml-1" />
        קישור לאיש קשר
      </Button>
    );
  }

  const submit = async () => {
    if (!contact.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await linkManyChatContact(phone, contact.trim());
      onLinked(res.display_name || '');
    } catch (err) {
      setError(readableError(err, 'הקישור נכשל'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
      <ol className="list-decimal space-y-0.5 pr-4">
        <li>
          ב-ManyChat, בעמוד אנשי הקשר, חפשו את{' '}
          <span className="font-semibold tabular-nums" dir="ltr">{localPhone(phone)}</span>.
        </li>
        <li>פתחו את איש הקשר והעתיקו את הכתובת מהשורה העליונה של הדפדפן.</li>
        <li>הדביקו אותה כאן.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input h-8 min-w-0 flex-1 text-xs"
          dir="ltr"
          placeholder="https://app.manychat.com/…"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          aria-label="הכתובת של איש הקשר ב-ManyChat"
          autoFocus
        />
        <Button type="button" size="sm" className="h-8" onClick={() => void submit()} disabled={saving || !contact.trim()}>
          {saving ? 'מקשר…' : 'קשר'}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setOpen(false)} disabled={saving}>
          ביטול
        </Button>
      </div>
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}
