'use client';

import Link from 'next/link';
import { CalendarDays, CreditCard, Eye, EyeOff, ClipboardList } from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './AuthScreen.module.css';

type AuthScreenProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  footer?: ReactNode;
  showLogo?: boolean;
};

function BrandWave() {
  return (
    <div className={styles.wave} aria-hidden>
      <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
        <path
          d="M0,64 C300,120 500,0 900,48 C1050,72 1150,88 1200,64 L1200,120 L0,120 Z"
          fill="#fbf8ff"
        />
      </svg>
    </div>
  );
}

export function AuthScreenLoading() {
  return (
    <div className={styles.loading}>
      <p>טוען...</p>
    </div>
  );
}

export default function AuthScreen({
  title,
  subtitle,
  children,
  backHref,
  backLabel = 'חזרה',
  footer,
  showLogo = true,
}: AuthScreenProps) {
  return (
    <div className={styles.page} dir="rtl">
      <aside className={styles.brand} aria-hidden={false}>
        <div className={styles.brandGlow} />
        <div className={styles.brandGlow2} />
        <div className={styles.brandInner}>
          <div className={styles.brandBadge}>
            <span className={styles.brandDot} />
            מערכת ניהול פנימית
          </div>
          <h1 className={styles.brandTitle}>קוגומלו</h1>
          <p className={styles.brandSubtitle}>
            ניהול חוגים, הרשמות, תשלומים ולוחות שעות — הכל במקום אחד.
          </p>
          <ul className={styles.brandFeatures}>
            <li className={styles.brandFeature}>
              <span className={styles.featureIcon}><ClipboardList size={18} strokeWidth={2.2} /></span>
              מעקב הרשמות ומנויים בזמן אמת
            </li>
            <li className={styles.brandFeature}>
              <span className={styles.featureIcon}><CreditCard size={18} strokeWidth={2.2} /></span>
              חשבוניות ותשלומים במערכת
            </li>
            <li className={styles.brandFeature}>
              <span className={styles.featureIcon}><CalendarDays size={18} strokeWidth={2.2} /></span>
              לוח שעות וניהול סניפים
            </li>
          </ul>
        </div>
        <BrandWave />
      </aside>

      <main className={styles.panel}>
        <div className={styles.card}>
          {backHref && (
            <Link href={backHref} className={styles.backLink}>
              ← {backLabel}
            </Link>
          )}

          {showLogo && (
            <div className={styles.logoWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/logo-cogomelo.webp"
                alt="קוגומלו"
                width={600}
                height={192}
                className={styles.logo}
              />
            </div>
          )}

          <header className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>{title}</h2>
            {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
          </header>

          {children}

          {!footer && (
            <p className={styles.footerNote}>
              גישה לצוות קוגומלו בלבד · אין הרשמה עצמית
            </p>
          )}
          {footer}
        </div>
      </main>
    </div>
  );
}

export function AuthAlert({
  variant,
  children,
}: {
  variant: 'error' | 'success';
  children: ReactNode;
}) {
  return (
    <div
      className={`${styles.alert} ${variant === 'error' ? styles.alertError : styles.alertSuccess}`}
      role="alert"
    >
      {children}
    </div>
  );
}

export function AuthField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  required,
  disabled,
  footer,
  showPasswordToggle,
  onTogglePassword,
  passwordVisible,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  footer?: ReactNode;
  showPasswordToggle?: boolean;
  onTogglePassword?: () => void;
  passwordVisible?: boolean;
}) {
  const inputType = showPasswordToggle ? (passwordVisible ? 'text' : 'password') : type;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.inputWrap}>
        <input
          id={id}
          type={inputType}
          className={`${styles.input} ${showPasswordToggle ? styles.inputWithToggle : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          dir={type === 'email' ? 'ltr' : undefined}
        />
        {showPasswordToggle && (
          <button
            type="button"
            className={styles.togglePassword}
            onClick={onTogglePassword}
            aria-label={passwordVisible ? 'הסתר סיסמה' : 'הצג סיסמה'}
            tabIndex={-1}
          >
            {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {footer && <div className={styles.fieldFooter}>{footer}</div>}
    </div>
  );
}

export function AuthSubmit({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button type="submit" className={styles.submit} disabled={disabled}>
      {children}
    </button>
  );
}
