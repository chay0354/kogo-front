import shell from '../card-link/card-link.module.css';
import styles from './store-closed.module.css';

export const metadata = { title: 'הקופה באתר סגורה זמנית — קוגומלו' };

/**
 * Where the website's checkout lands while card payment on the website is off
 * (STORE_WEBSITE_CARD_PAYMENTS_ENABLED): the website moves the whole page to the
 * payment address it gets back, so a kind page here, instead of an error there.
 * Nothing is charged and no order is written on our side. By the owner's word
 * (23.9.2026) it offers no other way to order — only that we will be back soon.
 */
export default function StoreClosedPage() {
  return (
    <div className={shell.page} dir="rtl">
      <header className={shell.header}>
        <div className={shell.brand}>קוגומלו</div>
        <h1 className={shell.title}>הקופה באתר סגורה זמנית</h1>
        <p className={shell.headerNote}>נחזור ממש בקרוב 💛</p>
      </header>

      <main className={shell.body}>
        <section className={shell.card}>
          <div className={styles.hero} aria-hidden="true">
            🛍️
          </div>
          <p className={styles.lead}>אנחנו משדרגים את מערכת התשלומים באתר,</p>
          <p className={styles.lead}>כדי שהקנייה אצלנו תהיה עוד יותר בטוחה ונעימה.</p>
          <p className={styles.note}>לא בוצע שום חיוב.</p>
        </section>

        <p className={styles.signoff}>תודה על הסבלנות, נתראה בקרוב! — צוות קוגומלו 🧡</p>
      </main>
    </div>
  );
}
