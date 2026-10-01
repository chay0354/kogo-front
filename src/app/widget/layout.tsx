import './widget-shell.css';
import styles from './widget-shell.module.css';
import { linkPreview } from '@/lib/linkPreview';

export const metadata = linkPreview({
  kind: 'register',
  title: 'הרשמה לחוגים — קוגומלו',
  description: 'בוחרים חוג, סניף ושעה, ונרשמים אונליין.',
  tokenPage: false,
});

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.widgetRoot}>{children}</div>;
}
