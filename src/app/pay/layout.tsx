import '../widget/widget-shell.css';
import styles from './pay.module.css';
import { linkPreview } from '@/lib/linkPreview';

export const metadata = linkPreview({
  kind: 'pay',
  title: 'תשלום מאובטח — קוגומלו',
  description: 'לחצו כדי לשלם בעמוד מאובטח.',
});

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}
