import './widget-shell.css';
import styles from './widget-shell.module.css';

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.widgetRoot}>{children}</div>;
}
