import '../widget/widget-shell.css';
import styles from './replace-card.module.css';
import { linkPreview } from '@/lib/linkPreview';

export const metadata = linkPreview({
  kind: 'card',
  title: 'עדכון כרטיס אשראי — קוגומלו',
  description: 'לחצו כדי לעדכן את הכרטיס של המשפחה בעמוד מאובטח.',
});

export default function ReplaceCardLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}
