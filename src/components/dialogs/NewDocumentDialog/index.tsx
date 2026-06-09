'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Check, ChevronLeft, ChevronRight, FileEdit, FileText, Receipt, User, X } from 'lucide-react';
import api from '@/lib/api';
import { Select } from '@/components/ui/select';
import type { ChildWithDetails } from '@/types/customer';
import styles from './index.module.css';
import { CLIENT_TYPE_OPTIONS, DOCUMENT_TYPE_OPTIONS } from './constants';
import { canAdvanceFromStep, getNextButtonLabel, getStepStatus } from './utils';
import { useNewDocumentWizard } from './useNewDocumentWizard';
import type { ClientType, NewDocumentDialogProps } from './types';

function getCustomerLabel(customer: ChildWithDetails): string {
  return customer.branch_name ? `${customer.full_name} — ${customer.branch_name}` : customer.full_name;
}

type IconComponent = typeof Building2;

const CLIENT_TYPE_ICONS: Record<ClientType, IconComponent> = {
  business: Building2,
  existing: User,
};

const DOCUMENT_TYPE_ICONS: Record<string, IconComponent> = {
  'חשבונית מס/קבלה': Receipt,
  'חשבונית עסקה': FileText,
  'טיוטה': FileEdit,
};

export default function NewDocumentDialog({ open, onClose }: NewDocumentDialogProps) {
  const wizard = useNewDocumentWizard(onClose);
  const {
    currentStep,
    steps,
    clientType,
    selectedCustomerId,
    docType,
    setClientType,
    setSelectedCustomerId,
    setDocType,
    goToStep,
    goNext,
    goBack,
    close,
  } = wizard;

  const { data: childrenData } = useQuery({
    queryKey: ['children'],
    queryFn: () => api.get('/customers/children/').then((r) => r.data?.results ?? r.data),
    staleTime: 5 * 60 * 1000,
    enabled: open && clientType === 'existing',
  });

  const customers: ChildWithDetails[] = useMemo(
    () => (Array.isArray(childrenData) ? childrenData : []),
    [childrenData]
  );

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, close]);

  if (!open) return null;

  const canAdvance = canAdvanceFromStep(currentStep, clientType, selectedCustomerId, docType);
  const isFirstStep = steps[0]?.id === currentStep;
  const isLastStep = steps[steps.length - 1]?.id === currentStep;

  return (
    <div
      className={styles.overlay}
      dir="rtl"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="new-document-dialog-title">
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <button type="button" className={styles.closeButton} onClick={close} aria-label="סגור">
              <X size={20} />
            </button>
            <h2 id="new-document-dialog-title" className={styles.title}>מסמך חדש</h2>
          </div>

          <ol className={styles.stepper}>
            {steps.map(({ id, label }, idx) => {
              const status = getStepStatus(id, currentStep, steps);
              const nextStep = steps[idx + 1];
              const lineActive = nextStep ? getStepStatus(nextStep.id, currentStep, steps) !== 'pending' : false;
              const isLast = idx === steps.length - 1;

              return (
                <li key={id} className={styles.stepperItem} aria-current={status === 'active' ? 'step' : undefined}>
                  <div className={styles.stepperNode}>
                    {status === 'completed' ? (
                      <button
                        type="button"
                        className={`${styles.stepCircle} ${styles.stepCircleCompleted}`}
                        onClick={() => goToStep(id)}
                        aria-label={`חזור לשלב: ${label}`}
                      >
                        <Check size={14} />
                      </button>
                    ) : (
                      <span className={`${styles.stepCircle} ${status === 'active' ? styles.stepCircleActive : styles.stepCirclePending}`}>
                        {idx + 1}
                      </span>
                    )}
                    <span className={`${styles.stepLabel} ${status === 'active' ? styles.stepLabelActive : ''}`}>
                      {label}
                    </span>
                  </div>
                  {!isLast && (
                    <span className={`${styles.stepperLine} ${lineActive ? styles.stepperLineActive : ''}`} />
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <div className={styles.body}>
          {currentStep === 'clientType' && <ClientTypeStep clientType={clientType} onSelect={setClientType} />}
          {currentStep === 'selectCustomer' && (
            <ExistingCustomerStep
              customers={customers}
              selectedCustomerId={selectedCustomerId}
              onSelect={setSelectedCustomerId}
            />
          )}
          {currentStep === 'docType' && <DocTypeStep docType={docType} onSelect={setDocType} />}
          {currentStep === 'documentDetails' && <DocumentDetailsStep />}
          {currentStep === 'summary' && (
            <SummaryStep clientType={clientType} docType={docType} customer={selectedCustomer} />
          )}
        </div>

        <div className={styles.footer}>
          {!isFirstStep ? (
            <button type="button" className={`${styles.navButton} ${styles.navButtonSecondary}`} onClick={goBack}>
              <ChevronRight size={16} />
              חזור
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className={`${styles.navButton} ${styles.navButtonPrimary}`}
            onClick={() => goNext(canAdvance)}
            disabled={!canAdvance}
          >
            {getNextButtonLabel(currentStep, steps)}
            {!isLastStep && <ChevronLeft size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

interface SelectableCardProps {
  icon: IconComponent;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}

function SelectableCard({ icon: Icon, title, description, selected, onSelect }: SelectableCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`${styles.selectableCard} ${selected ? styles.selectableCardSelected : ''}`}
      onClick={onSelect}
    >
      <span className={`${styles.cardIconWrap} ${selected ? styles.cardIconWrapSelected : ''}`}>
        <Icon size={24} className={selected ? styles.cardIconSelected : styles.cardIcon} />
      </span>
      <span className={styles.cardTitle}>{title}</span>
      <span className={styles.cardDescription}>{description}</span>
    </button>
  );
}

interface ClientTypeStepProps {
  clientType: ClientType | null;
  onSelect: (type: ClientType) => void;
}

function ClientTypeStep({ clientType, onSelect }: ClientTypeStepProps) {
  return (
    <div>
      <p className={styles.stepSubtitle}>בחר סוג לקוח להתחלת תהליך הפקת מסמך</p>
      <div className={styles.cardGrid} role="radiogroup" aria-label="סוג לקוח">
        {CLIENT_TYPE_OPTIONS.map((option) => (
          <SelectableCard
            key={option.type}
            icon={CLIENT_TYPE_ICONS[option.type]}
            title={option.title}
            description={option.description}
            selected={clientType === option.type}
            onSelect={() => onSelect(option.type)}
          />
        ))}
      </div>
    </div>
  );
}

interface ExistingCustomerStepProps {
  customers: ChildWithDetails[];
  selectedCustomerId: string | null;
  onSelect: (id: string) => void;
}

function ExistingCustomerStep({ customers, selectedCustomerId, onSelect }: ExistingCustomerStepProps) {
  return (
    <div>
      <p className={styles.stepSubtitle}>בחר לקוח קיים מתוך הרשימה</p>
      <div className={styles.fieldGroup}>
        <label htmlFor="existing-customer" className={styles.fieldLabel}>לקוח קיים</label>
        <Select
          id="existing-customer"
          className={styles.fieldSelect}
          value={selectedCustomerId ?? ''}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="" disabled>בחר לקוח קיים</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {getCustomerLabel(customer)}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

interface DocTypeStepProps {
  docType: string | null;
  onSelect: (type: string) => void;
}

function DocTypeStep({ docType, onSelect }: DocTypeStepProps) {
  return (
    <div>
      <p className={styles.stepSubtitle}>בחר את סוג המסמך שברצונך להפיק</p>
      <div className={styles.cardGrid} role="radiogroup" aria-label="סוג מסמך">
        {DOCUMENT_TYPE_OPTIONS.map((option) => (
          <SelectableCard
            key={option.type}
            icon={DOCUMENT_TYPE_ICONS[option.type] ?? FileText}
            title={option.type}
            description={option.description}
            selected={docType === option.type}
            onSelect={() => onSelect(option.type)}
          />
        ))}
      </div>
    </div>
  );
}

function DocumentDetailsStep() {
  return (
    <div>
      <p className={styles.stepSubtitle}>הזן את פרטי המסמך</p>
      <div className={styles.placeholderBox}>
        <FileText size={28} className={styles.placeholderIcon} />
        <p className={styles.placeholderText}>טופס פרטי המסמך יתווסף כאן בהמשך הפיתוח</p>
      </div>
    </div>
  );
}

interface SummaryStepProps {
  clientType: ClientType | null;
  docType: string | null;
  customer: ChildWithDetails | null;
}

function SummaryStep({ clientType, docType, customer }: SummaryStepProps) {
  const clientLabel = CLIENT_TYPE_OPTIONS.find((option) => option.type === clientType)?.title ?? '—';

  return (
    <div>
      <p className={styles.stepSubtitle}>סקור את פרטי המסמך לפני ההפקה</p>
      <dl className={styles.summaryList}>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryLabel}>סוג לקוח</dt>
          <dd className={styles.summaryValue}>{clientLabel}</dd>
        </div>
        {clientType === 'existing' && (
          <div className={styles.summaryRow}>
            <dt className={styles.summaryLabel}>לקוח</dt>
            <dd className={styles.summaryValue}>{customer ? getCustomerLabel(customer) : '—'}</dd>
          </div>
        )}
        <div className={styles.summaryRow}>
          <dt className={styles.summaryLabel}>סוג מסמך</dt>
          <dd className={styles.summaryValue}>{docType ?? '—'}</dd>
        </div>
      </dl>
    </div>
  );
}
