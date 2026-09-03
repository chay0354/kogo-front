import '../widget/widget-shell.css';
import styles from './update-card.module.css';

export default function UpdateCardLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}
