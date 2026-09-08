import '../widget/widget-shell.css';
import styles from '../update-card/update-card.module.css';

export const metadata = { title: 'הזנת כרטיס — קוגומלו' };

export default function CardLinkLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}
