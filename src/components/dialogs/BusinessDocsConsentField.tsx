'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { fetchBusinessCustomerConsent, setBusinessCustomerConsent } from '@/lib/signingApi';
import { readableError } from '@/lib/apiError';
import {
  computerizedDocsConsentLine,
  type ComputerizedDocsConsent,
} from './computerizedDocsConsent';

export const BUSINESS_DOCS_CONSENT_LABEL = 'מסכים/ה לקבל מסמכים במייל (מסמך ממוחשב)';

/** The line under the box for a customer that is not saved yet. */
export const BUSINESS_DOCS_CONSENT_PENDING_NOTE = 'תירשם כשהלקוח יישמר';

export interface BusinessDocsConsentClassNames {
  row?: string;
  label?: string;
  note?: string;
  error?: string;
}

interface BusinessDocsConsentFieldProps {
  /** The saved customer, or null while the details are a new customer's not saved yet. */
  customerId: string | null;
  /** For a customer not saved yet: whether consent is to be recorded once it is. */
  pending?: boolean;
  onPendingChange?: (pending: boolean) => void;
  disabled?: boolean;
  classNames?: BusinessDocsConsentClassNames;
}

/**
 * A business customer's consent to receive tax documents by email — סעיף 18ב(ג)
 * — as the office records it: a box, and under it when it was given (or
 * withdrawn). For a saved customer the box writes straight to the server; the
 * consent is read afresh from the customer's own record whenever the customer
 * changes. A server that keeps no consent for business customers leaves the
 * field out altogether, rather than show "no consent" it cannot back.
 *
 * For a customer not saved yet the box only says what to record; the caller
 * records it once the customer exists.
 */
export default function BusinessDocsConsentField({
  customerId,
  pending = false,
  onPendingChange,
  disabled = false,
  classNames = {},
}: BusinessDocsConsentFieldProps) {
  const inputId = useId();
  const [consent, setConsent] = useState<ComputerizedDocsConsent | null>(null);
  const [loading, setLoading] = useState(() => Boolean(customerId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);

  useEffect(() => {
    setError('');
    if (!customerId) {
      request.current += 1;
      setConsent(null);
      setLoading(false);
      return;
    }
    const mine = ++request.current;
    setLoading(true);
    fetchBusinessCustomerConsent(customerId)
      .then((value) => {
        if (mine === request.current) setConsent(value);
      })
      .catch(() => {
        if (mine === request.current) setConsent(null);
      })
      .finally(() => {
        if (mine === request.current) setLoading(false);
      });
  }, [customerId]);

  async function change(next: boolean) {
    if (!customerId) {
      onPendingChange?.(next);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await setBusinessCustomerConsent(customerId, next);
      // A read still on its way must not paint over what was just saved.
      request.current += 1;
      setLoading(false);
      if (saved) setConsent(saved);
    } catch (err) {
      setError(readableError(err, next ? 'רישום ההסכמה נכשל' : 'ביטול ההסכמה נכשל'));
    } finally {
      setSaving(false);
    }
  }

  // A saved customer whose record carries no consent fields: the server does not keep them.
  if (customerId && !loading && !consent) return null;

  const checked = customerId ? Boolean(consent?.accepts_computerized_documents) : pending;
  const note = customerId
    ? (loading ? 'טוען…' : consent ? computerizedDocsConsentLine(consent) : '')
    : (pending ? BUSINESS_DOCS_CONSENT_PENDING_NOTE : 'לא נרשמה הסכמה');

  return (
    <div className={classNames.row}>
      <label htmlFor={inputId} className={classNames.label}>
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled || saving || (Boolean(customerId) && loading)}
          onChange={(event) => void change(event.target.checked)}
        />
        {BUSINESS_DOCS_CONSENT_LABEL}
      </label>
      {note && <p className={classNames.note}>{saving ? 'שומר…' : note}</p>}
      {error && (
        <p className={classNames.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
