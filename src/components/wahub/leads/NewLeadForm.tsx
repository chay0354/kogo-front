'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { readableError } from '@/lib/apiError';
import { createWahubContact, existingContactId } from '@/lib/wahubApi';
import type { WahubContact } from '@/types/wahub';
import { Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

interface NewLeadFormProps {
  onClose: () => void;
  onCreated: (contact: WahubContact) => void;
  onOpenExisting: (id: number) => void;
}

/**
 * A lead added by hand: a phone, a name, and a note if there is one. It opens
 * inside the page, as a card above the list — the sketch has no pop-up windows.
 */
export default function NewLeadForm({ onClose, onCreated, onOpenExisting }: NewLeadFormProps) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [existingId, setExistingId] = useState<number | null>(null);

  const digits = phone.replace(/\D/g, '');
  const ready = digits.length >= 9 && !saving;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setSaving(true);
    setError('');
    setExistingId(null);
    try {
      const contact = await createWahubContact({ phone: phone.trim(), name: name.trim(), note });
      onCreated(contact);
      onClose();
    } catch (failure) {
      const existing = existingContactId(failure);
      if (existing) {
        setExistingId(existing);
        setError('הטלפון הזה כבר קיים ברשימה.');
      } else {
        setError(readableError(failure, 'הליד לא נשמר'));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={cx(s.card, s.feedin)} aria-label="ליד חדש">
      <div className={s.ct}>
        <h3>ליד חדש</h3>
        <button type="button" onClick={onClose} aria-label="סגור" className={cx(s.ib, s.ibSm)}>
          <X aria-hidden="true" />
        </button>
      </div>
      <form onSubmit={submit}>
        <div className={s.form}>
          <label>
            טלפון
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="050-1234567"
              autoComplete="off"
              autoFocus
              className={s.fieldLtr}
            />
          </label>
          <label>
            שם
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              autoComplete="off"
            />
          </label>
          <label className={s.full}>
            הערה (לא חובה)
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={2000} />
          </label>
        </div>

        {error && (
          <div role="alert" className={cx(s.noteBad, 'mt-3')}>
            <p className="m-0">{error}</p>
            {existingId && (
              <button
                type="button"
                onClick={() => {
                  onOpenExisting(existingId);
                  onClose();
                }}
                className={cx(s.link, s.badText, 'mt-1')}
              >
                פתח את השיחה הקיימת
              </button>
            )}
          </div>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className={s.btn}>
            ביטול
          </button>
          <button type="submit" disabled={!ready} className={cx(s.btn, s.btnP)}>
            {saving && <Spinner />}
            הוסף ליד
          </button>
        </div>
      </form>
    </section>
  );
}
