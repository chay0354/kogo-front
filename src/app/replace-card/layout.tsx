import '../widget/widget-shell.css';
import styles from './replace-card.module.css';

export default function ReplaceCardLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}
