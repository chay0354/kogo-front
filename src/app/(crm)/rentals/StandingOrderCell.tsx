'use client';

import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Ban, CreditCard, Loader2, Pause, Pencil, Play, Plus, Receipt } from 'lucide-react';
import type { StandingOrder } from '@/lib/rentalBillingApi';
import type { Tenancy } from '@/lib/rentalsApi';
import { ToneChip } from './StatusChips';
import { blockedChargeChip, canOpenOrder, orderActions, orderCell, type OrderLifecycle } from './billingUtils';
import { tenantName } from './tenancyUtils';
import styles from './rentals.module.css';

interface StandingOrderCellProps {
  tenancy: Tenancy;
  /** The tenancy's order — its open one, else its newest ended one. Null before the first. */
  order: StandingOrder | null;
  /** The orders are still on their way: whether this tenancy has one is not known yet. */
  loading: boolean;
  /** The orders could not be read. */
  failed: boolean;
  /** A pause, resume or end of this order is out. */
  busy: boolean;
  /** Its last lifecycle action's failure, in the server's words. */
  error: string;
  onOpen: () => void;
  onEdit: (order: StandingOrder) => void;
  onCardLink: (order: StandingOrder) => void;
  onCharges: (order: StandingOrder) => void;
  onLifecycle: (kind: OrderLifecycle, order: StandingOrder) => void;
}

/**
 * A tenancy's standing order in its row: where it stands, what it charges a
 * month with VAT, when the next charge is due and the card on file — with the
 * office's actions on it. With no open order, the way to open one. Whether an
 * action applies is the order's status; the server refuses what it does not allow.
 */
export default function StandingOrderCell({
  tenancy,
  order,
  loading,
  failed,
  busy,
  error,
  onOpen,
  onEdit,
  onCardLink,
  onCharges,
  onLifecycle,
}: StandingOrderCellProps) {
  const name = tenantName(tenancy.tenant);
  const errorLine = error ? (
    <p className={styles.contractError} role="alert">
      <AlertCircle size={13} aria-hidden="true" />
      <span>{error}</span>
    </p>
  ) : null;

  if (!order && loading) return <span className={styles.dash}>טוען…</span>;
  if (!order && failed) {
    return (
      <span className={styles.dash} title="לא הצלחנו לטעון את הוראות הקבע — נסו לרענן את הדף">
        לא נטען
      </span>
    );
  }

  const openButton = canOpenOrder(tenancy, order) ? (
    <button type="button" className={styles.contractIssue} aria-label={`פתיחת הוראת קבע ל־${name}`} onClick={onOpen}>
      <Plus size={13} aria-hidden="true" />
      פתיחת הוראת קבע
    </button>
  ) : null;

  if (!order) {
    return (
      <>
        {openButton ?? <span className={styles.dash}>—</span>}
        {errorLine}
      </>
    );
  }

  const cell = orderCell(order);
  const actions = orderActions(order);
  const blocked = blockedChargeChip(order);

  return (
    <div className={styles.contractStack}>
      <div className={styles.contractLine}>
        <ToneChip tone={cell.tone}>{cell.statusLabel}</ToneChip>
        <span className={styles.orderTotal}>{cell.total}</span>
      </div>
      {/* Nothing on this tenancy is charged while a month waits for a person to decide. */}
      {blocked && (
        <span className={styles.blockedChip} title={blocked.title}>
          <AlertTriangle size={12} aria-hidden="true" />
          {blocked.label}
          <span className={styles.srOnly}> — {blocked.title}</span>
        </span>
      )}
      {cell.next && <span className={styles.orderMeta}>{cell.next}</span>}
      <span className={styles.orderMeta}>
        {cell.card ? (
          <>
            כרטיס <bdi dir="ltr">••{cell.card.last4}</bdi>
            {cell.card.expiry && (
              <>
                {' · '}
                <bdi dir="ltr">{cell.card.expiry}</bdi>
              </>
            )}
          </>
        ) : (
          'אין כרטיס עדיין'
        )}
      </span>
      {cell.problem && (
        <p className={styles.contractError} role="note">
          <AlertCircle size={13} aria-hidden="true" />
          <span>{cell.problem}</span>
        </p>
      )}

      <div className={styles.orderActions}>
        {actions.cardLink && (
          <button
            type="button"
            className={styles.signedCopy}
            aria-label={`הקישור לכרטיס של ${name}`}
            disabled={busy}
            onClick={() => onCardLink(order)}
          >
            <CreditCard size={13} aria-hidden="true" />
            קישור לכרטיס
          </button>
        )}
        <button
          type="button"
          className={styles.signedCopy}
          aria-label={`החיובים של ${name}`}
          disabled={busy}
          onClick={() => onCharges(order)}
        >
          <Receipt size={13} aria-hidden="true" />
          חיובים
        </button>
        {actions.edit && (
          <IconAction label="עריכת הוראת הקבע" ariaLabel={`עריכת הוראת הקבע של ${name}`} disabled={busy} onClick={() => onEdit(order)}>
            <Pencil size={13} aria-hidden="true" />
          </IconAction>
        )}
        {actions.pause && (
          <IconAction label="השהיה" ariaLabel={`השהיית הוראת הקבע של ${name}`} disabled={busy} onClick={() => onLifecycle('pause', order)}>
            {busy ? <Loader2 size={13} className={styles.spin} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
          </IconAction>
        )}
        {actions.resume && (
          <IconAction label="חידוש" ariaLabel={`חידוש הוראת הקבע של ${name}`} disabled={busy} onClick={() => onLifecycle('resume', order)}>
            {busy ? <Loader2 size={13} className={styles.spin} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
          </IconAction>
        )}
        {actions.end && (
          <IconAction
            label="סיום הוראת הקבע"
            ariaLabel={`סיום הוראת הקבע של ${name}`}
            disabled={busy}
            danger
            onClick={() => onLifecycle('end', order)}
          >
            <Ban size={13} aria-hidden="true" />
          </IconAction>
        )}
      </div>

      {/* An ended order stays on view for its charges; a new one can be opened beside it. */}
      {openButton}
      {errorLine}
    </div>
  );
}

function IconAction({
  label,
  ariaLabel,
  disabled,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  ariaLabel: string;
  disabled: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${styles.contractDownload} ${danger ? styles.iconDanger : ''}`}
      title={label}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
