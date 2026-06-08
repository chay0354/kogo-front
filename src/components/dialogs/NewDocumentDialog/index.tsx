'use client';

import { useEffect } from 'react';
import { Building2, Check, ChevronLeft, ChevronRight, FileEdit, FileText, Receipt, User, X } from 'lucide-react';
import styles from './index.module.css';
import { CLIENT_TYPE_OPTIONS, DOCUMENT_TYPE_OPTIONS, WIZARD_STEPS } from './constants';
import { canAdvanceFromStep, getNextButtonLabel, getStepStatus } from './utils';
import { useNewDocumentWizard } from './useNewDocumentWizard';
import type { ClientType, NewDocumentDialogProps } from './types';

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
  const { currentStep, clientType, docType, setClientType, setDocType, goToStep, goNext, goBack, close } = wizard;

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, close]);

  if (!open) return null;

  const canAdvance = canAdvanceFromStep(currentStep, clientType, docType);

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
            {WIZARD_STEPS.map(({ step, label }, idx) => {
              const status = getStepStatus(step, currentStep);
              const nextStep = WIZARD_STEPS[idx + 1];
              const lineActive = nextStep ? getStepStatus(nextStep.step, currentStep) !== 'pending' : false;
              const isLast = idx === WIZARD_STEPS.length - 1;

              return (
                <li key={step} className={styles.stepperItem} aria-current={status === 'active' ? 'step' : undefined}>
                  <div className={styles.stepperNode}>
                    {status === 'completed' ? (
                      <button
                        type="button"
                        className={`${styles.stepCircle} ${styles.stepCircleCompleted}`}
                        onClick={() => goToStep(step)}
                        aria-label={`חזור לשלב: ${label}`}
                      >
                        <Check size={14} />
                      </button>
                    ) : (
                      <span className={`${styles.stepCircle} ${status === 'active' ? styles.stepCircleActive : styles.stepCirclePending}`}>
                        {step}
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
          {currentStep === 1 && <ClientTypeStep clientType={clientType} onSelect={setClientType} />}
          {currentStep === 2 && <DocTypeStep docType={docType} onSelect={setDocType} />}
          {currentStep === 3 && <DocumentDetailsStep />}
          {currentStep === 4 && <SummaryStep clientType={clientType} docType={docType} />}
        </div>

        <div className={styles.footer}>
          {currentStep > 1 ? (
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
            {getNextButtonLabel(currentStep)}
            {currentStep < 4 && <ChevronLeft size={16} />}
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
}

function SummaryStep({ clientType, docType }: SummaryStepProps) {
  const clientLabel = CLIENT_TYPE_OPTIONS.find((option) => option.type === clientType)?.title ?? '—';

  return (
    <div>
      <p className={styles.stepSubtitle}>סקור את פרטי המסמך לפני ההפקה</p>
      <dl className={styles.summaryList}>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryLabel}>סוג לקוח</dt>
          <dd className={styles.summaryValue}>{clientLabel}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryLabel}>סוג מסמך</dt>
          <dd className={styles.summaryValue}>{docType ?? '—'}</dd>
        </div>
      </dl>
    </div>
  );
}
