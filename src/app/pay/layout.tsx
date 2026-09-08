import '../widget/widget-shell.css';
import styles from './pay.module.css';

export const metadata = { title: 'תשלום — קוגומלו' };

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}
