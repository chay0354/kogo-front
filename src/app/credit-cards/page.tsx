'use client';

import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';

import styles from './page.module.css';

export default function CreditCardsPage() {
  return (
    <AppLayout>
      <PageHeader title="כרטיסי אשראי" />

      <div className={styles.wrapper}>
        <div className={styles.card}>
          <form className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="cardholderName">
                שם בעל הכרטיס
              </label>
              <input id="cardholderName" name="cardholderName" type="text" className={styles.input} />
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
                className={styles.input}
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
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="cardNotes">
                הערות / שייך ל...
              </label>
              <input id="cardNotes" name="cardNotes" type="text" className={styles.input} />
            </div>

            <button type="submit" className={styles.submitButton}>
              שמור
            </button>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
