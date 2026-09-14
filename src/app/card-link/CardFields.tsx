'use client';

import { sanitizeIsraeliIdInput } from '@/lib/israeliId';
import styles from './card-link.module.css';

export interface CardFieldValues {
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  cardHolderId: string;
}

export type CardField = keyof CardFieldValues;

interface CardFieldsProps {
  values: CardFieldValues;
  onChange: (field: CardField, value: string) => void;
  /** The ID field's error, shown under it. */
  idError?: string | null;
  onIdBlur?: () => void;
  /** Held while a submit is out, so what is sent is what the tenant sees. */
  disabled?: boolean;
}

/**
 * The card form the public card pages share — the parents' card link
 * (/card-link, /c) and the tenant's standing-order page (/rc) — so a card is
 * typed into one set of fields, in one palette, wherever it is asked for. The
 * ID keeps to digits as it is typed; checking it, and the rest, is the page's.
 */
export default function CardFields({ values, onChange, idError, onIdBlur, disabled }: CardFieldsProps) {
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>פרטי כרטיס אשראי</h2>
      <div className={styles.fields}>
        <div>
          <label className={styles.label} htmlFor="card-number">מספר כרטיס</label>
          <input
            id="card-number"
            className={styles.input}
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="4580 4580 4580 4580"
            value={values.cardNumber}
            onChange={(e) => onChange('cardNumber', e.target.value)}
            disabled={disabled}
          />
        </div>

        <div className={styles.grid3}>
          <div>
            <label className={styles.label} htmlFor="exp-month">חודש</label>
            <input
              id="exp-month"
              className={styles.input}
              inputMode="numeric"
              autoComplete="cc-exp-month"
              placeholder="12"
              value={values.expiryMonth}
              onChange={(e) => onChange('expiryMonth', e.target.value)}
              disabled={disabled}
            />
          </div>
          <div>
            <label className={styles.label} htmlFor="exp-year">שנה</label>
            <input
              id="exp-year"
              className={styles.input}
              inputMode="numeric"
              autoComplete="cc-exp-year"
              placeholder="2028"
              value={values.expiryYear}
              onChange={(e) => onChange('expiryYear', e.target.value)}
              disabled={disabled}
            />
          </div>
          <div>
            <label className={styles.label} htmlFor="cvv">CVV</label>
            <input
              id="cvv"
              className={styles.input}
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="123"
              value={values.cvv}
              onChange={(e) => onChange('cvv', e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>

        <div>
          <label className={styles.label} htmlFor="card-id">תעודת זהות בעל הכרטיס</label>
          <input
            id="card-id"
            className={`${styles.input} ${idError ? styles.inputInvalid : ''}`}
            inputMode="numeric"
            placeholder="012345678"
            value={values.cardHolderId}
            onChange={(e) => onChange('cardHolderId', sanitizeIsraeliIdInput(e.target.value))}
            onBlur={onIdBlur}
            aria-invalid={Boolean(idError)}
            aria-describedby={idError ? 'card-id-error' : undefined}
            disabled={disabled}
          />
          {idError ? (
            <p className={styles.fieldError} id="card-id-error">
              {idError}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
