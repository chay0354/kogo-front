'use client';

import { useState } from 'react';

import PageHeader from '@/components/PageHeader';
import { chargeCreditCard } from '@/lib/api';

import styles from './page.module.css';

const MAX_AMOUNT = 5;

export default function CreditCardsPage() {
  const [cardholderName, setCardholderName] = useState('');
  const [cardHolderId, setCardHolderId] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardNotes, setCardNotes] = useState('');
  const [amount, setAmount] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; text: string } | null>(null);

  const clampAmount = (value: string) => {
    if (value === '') return '';
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return value;
    if (numeric > MAX_AMOUNT) return String(MAX_AMOUNT);
    if (numeric < 0) return '0';
    return value;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);

    const numericAmount = Number(amount);
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0 || numericAmount > MAX_AMOUNT) {
      setResult({ success: false, text: `הסכום חייב להיות בין 0 ל-${MAX_AMOUNT} ש"ח` });
      return;
    }

    const [expiryMonthStr, expiryYearStr] = cardExpiry.split('/').map((part) => part.trim());
    const expiryMonth = Number(expiryMonthStr);
    const expiryYear = Number(expiryYearStr);
    if (!expiryMonth || !expiryYear) {
      setResult({ success: false, text: 'תוקף כרטיס לא תקין (יש להזין בפורמט MM/YY)' });
      return;
    }

    setSubmitting(true);
    try {
      const response = await chargeCreditCard({
        card_holder_id: cardHolderId,
        card_number: cardNumber.replace(/\s+/g, ''),
        expiry_month: expiryMonth,
        expiry_year: expiryYear < 100 ? 2000 + expiryYear : expiryYear,
        cvv: cardCvv,
        amount: numericAmount,
      });

      if (response.success) {
        setResult({ success: true, text: response.message || 'החיוב בוצע בהצלחה' });
      } else {
        setResult({ success: false, text: response.error || response.message || 'החיוב נכשל' });
      }
    } catch {
      setResult({ success: false, text: 'שגיאה בביצוע החיוב' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader title="סליקת כרטיס אשראי אמיתי" />

      <div className={styles.wrapper}>
        <div className={styles.card}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="cardholderName">
                שם בעל הכרטיס
              </label>
              <input
                id="cardholderName"
                name="cardholderName"
                type="text"
                className={styles.input}
                value={cardholderName}
                onChange={(e) => setCardholderName(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="cardHolderId">
                תעודת זהות בעל הכרטיס
              </label>
              <input
                id="cardHolderId"
                name="cardHolderId"
                type="text"
                inputMode="numeric"
                dir="ltr"
                className={styles.input}
                value={cardHolderId}
                onChange={(e) => setCardHolderId(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="cardNumber">
                מספר כרטיס
              </label>
              <input
                id="cardNumber"
                name="cardNumber"
                type="text"
                inputMode="numeric"
                dir="ltr"
                className={styles.input}
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="cardExpiry">
                תוקף (MM/YY)
              </label>
              <input
                id="cardExpiry"
                name="cardExpiry"
                type="text"
                inputMode="numeric"
                dir="ltr"
                placeholder="MM/YY"
                className={styles.input}
                value={cardExpiry}
                onChange={(e) => setCardExpiry(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="cardCvv">
                CVV
              </label>
              <input
                id="cardCvv"
                name="cardCvv"
                type="text"
                inputMode="numeric"
                dir="ltr"
                className={styles.input}
                value={cardCvv}
                onChange={(e) => setCardCvv(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="amount">
                סכום לחיוב (עד ₪{MAX_AMOUNT})
              </label>
              <input
                id="amount"
                name="amount"
                type="number"
                inputMode="decimal"
                dir="ltr"
                min={0.01}
                max={MAX_AMOUNT}
                step="0.01"
                className={styles.input}
                value={amount}
                onChange={(e) => setAmount(clampAmount(e.target.value))}
                onBlur={(e) => setAmount(clampAmount(e.target.value))}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="cardNotes">
                הערות / שייך ל...
              </label>
              <input
                id="cardNotes"
                name="cardNotes"
                type="text"
                className={styles.input}
                value={cardNotes}
                onChange={(e) => setCardNotes(e.target.value)}
              />
            </div>

            {result && (
              <div className={result.success ? styles.resultSuccess : styles.resultError}>
                {result.text}
              </div>
            )}

            <button type="submit" className={styles.submitButton} disabled={submitting}>
              {submitting ? 'מבצע חיוב...' : 'חייב'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
