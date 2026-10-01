import '../widget/widget-shell.css';
import styles from './update-card.module.css';
import { linkPreview } from '@/lib/linkPreview';

export const metadata = linkPreview({
  kind: 'card',
  title: 'עדכון כרטיס אשראי — קוגומלו',
  description: 'לחצו כדי לעדכן את פרטי הכרטיס בעמוד מאובטח.',
});

export default function UpdateCardLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}
