'use client';

import { MessageCircle, Phone } from 'lucide-react';
import { telHref, whatsappHref } from '@/lib/contactLinks';
import styles from './index.module.css';

interface Props {
  name: string;
  phone: string;
  onClose: () => void;
}

/**
 * Tap a number, get WhatsApp or a call.
 *
 * Both actions close the sheet on the way out, so coming back from WhatsApp
 * does not land on a dialog nobody asked for. Neither one sends or dials by
 * itself — they hand off to the phone, and the person decides.
 */
export default function ContactSheet({ name, phone, onClose }: Props) {
  return (
    <div
      className={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-label={`יצירת קשר עם ${name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.box}>
        <div className={styles.name}>{name}</div>
        <div className={styles.phone}>{phone}</div>
        <div className={styles.actions}>
          <a
            className={`${styles.action} ${styles.whatsapp}`}
            href={whatsappHref(phone)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
          >
            <MessageCircle size={26} strokeWidth={2.2} />
            <span>וואטסאפ</span>
          </a>
          <a className={`${styles.action} ${styles.call}`} href={telHref(phone)} onClick={onClose}>
            <Phone size={26} strokeWidth={2.2} />
            <span>שיחה</span>
          </a>
        </div>
        <button type="button" className={styles.cancel} onClick={onClose}>
          ביטול
        </button>
      </div>
    </div>
  );
}
