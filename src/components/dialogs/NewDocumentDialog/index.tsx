'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Banknote,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileEdit,
  FileMinus,
  FileText,
  Loader2,
  PenLine,
  Receipt,
  Search,
  User,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import api, { createBusinessCustomer, fetchBranchesList, searchBusinessCustomers } from '@/lib/api';
import { createDocument, fetchDocuments } from '@/lib/documentsApi';
import type { CreateDocumentPayload } from '@/types/document';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { ChildWithDetails } from '@/types/customer';
import styles from './index.module.css';
import { BUSINESS_TYPE_OPTIONS, CLIENT_TYPE_OPTIONS, DOCUMENT_TYPE_OPTIONS } from './constants';
import { canAdvanceFromStep, getNextButtonLabel, getStepStatus } from './utils';
import { useNewDocumentWizard } from './useNewDocumentWizard';
import type {
  BusinessCustomer,
  BusinessCustomerFormData,
  CheckRow,
  ClientType,
  CreditInvoiceData,
  InvoiceDetailsData,
  LineItem,
  NewDocumentDialogProps,
  ReceiptDetailsData,
} from './types';

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
  'קבלה': Receipt,
  'חשבונית עסקה': FileText,
  'חשבונית מס זיכוי': FileMinus,

};

const DOCUMENT_TYPE_DANGER = new Set(['חשבונית מס זיכוי']);

const PAYMENT_METHODS = [
  { id: 'מזומן', label: 'מזומן', icon: Banknote },
  { id: 'צ\'ק', label: 'צ\'ק', icon: PenLine },
  { id: 'אשראי', label: 'אשראי', icon: CreditCard },
  { id: 'העברה בנקאית', label: 'העברה בנקאית', icon: ArrowLeftRight },
] as const;

export default function NewDocumentDialog({ open, onClose }: NewDocumentDialogProps) {
  const wizard = useNewDocumentWizard(onClose);
  const {
    currentStep,
    steps,
    clientType,
    selectedCustomerId,
    businessCustomerId,
    businessFormData,
    docType,
    selectedBranchId,
    invoiceDetails,
    receiptDetails,
    creditInvoiceDetails,
    setClientType,
    setSelectedCustomerId,
    setBusinessCustomerId,
    setBusinessFormData,
    setDocType,
    setSelectedBranchId,
    setInvoiceDetails,
    setReceiptDetails,
    setCreditInvoiceDetails,
    goToStep,
    goNext,
    goBack,
    close,
  } = wizard;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const queryClient = useQueryClient();

  const { data: childrenData } = useQuery({
    queryKey: ['children'],
    queryFn: () => api.get('/customers/children/').then((r) => r.data?.results ?? r.data),
    staleTime: 5 * 60 * 1000,
    enabled: open && clientType === 'existing',
  });

  const { data: branchesData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: fetchBranchesList,
    staleTime: 10 * 60 * 1000,
    enabled: open,
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
      if (e.key === 'Escape') setShowCloseConfirm(true);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!open) return null;

  const canAdvance = canAdvanceFromStep(
    currentStep,
    clientType,
    selectedCustomerId,
    businessCustomerId,
    businessFormData,
    docType,
    invoiceDetails,
    creditInvoiceDetails,
    receiptDetails,
    selectedBranchId
  );
  const isFirstStep = steps[0]?.id === currentStep;
  const isLastStep = steps[steps.length - 1]?.id === currentStep;

  async function handleNext() {
    setSubmitError(null);

    // Create new business customer before advancing
    if (currentStep === 'businessClientDetails' && businessCustomerId === null) {
      if (
        businessFormData.first_name.trim() !== '' &&
        businessFormData.last_name.trim() !== ''
      ) {
        setIsSubmitting(true);
        try {
          const created = await createBusinessCustomer(businessFormData);
          setBusinessCustomerId(created.id);
          goNext(true);
        } catch {
          // leave isSubmitting false so the user can retry
        } finally {
          setIsSubmitting(false);
        }
        return;
      }
    }

    // Submit document on the last step
    if (isLastStep && canAdvance) {
      setIsSubmitting(true);
      try {
        const payload = buildDocumentPayload();
        await createDocument(payload);
        queryClient.invalidateQueries({ queryKey: ['formal-documents'] });
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          close();
        }, 1500);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'שגיאה ביצירת המסמך';
        setSubmitError(msg);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    goNext(canAdvance);
  }

  function buildDocumentPayload(): CreateDocumentPayload {
    const docTypeMap: Record<string, CreateDocumentPayload['document_type']> = {
      'חשבונית מס': 'tax_invoice',
      'חשבונית מס/קבלה': 'combined',
      'קבלה': 'receipt',
      'חשבונית עסקה': 'transaction_invoice',
      'חשבונית מס זיכוי': 'credit_invoice',
    };
    const mappedType = docTypeMap[docType ?? ''] ?? 'tax_invoice';

    const base: CreateDocumentPayload = {
      document_type: mappedType,
      client_type: clientType ?? 'existing',
      child_id: clientType === 'existing' ? selectedCustomerId : null,
      business_customer_id: clientType === 'business' ? businessCustomerId : null,
      branch_id: selectedBranchId,
    };

    if (mappedType === 'receipt') {
      return { ...base, receipt_details: receiptDetails as unknown as CreateDocumentPayload['receipt_details'] };
    }
    if (mappedType === 'credit_invoice') {
      return {
        ...base,
        credit_invoice_details: {
          document_date: creditInvoiceDetails.documentDate,
          linked_invoice_id: creditInvoiceDetails.linkedInvoiceId,
          credit_reason: creditInvoiceDetails.creditReason,
          credit_amount_before_vat: creditInvoiceDetails.creditAmountBeforeVat,
          vat_exempt: creditInvoiceDetails.vatExempt,
          customer_notes: creditInvoiceDetails.customerNotes,
          internal_notes: creditInvoiceDetails.internalNotes,
        },
      };
    }
    return {
      ...base,
      invoice_details: {
        document_date: invoiceDetails.documentDate,
        due_date: invoiceDetails.dueDate || null,
        description: invoiceDetails.description,
        currency: invoiceDetails.currency as 'ILS' | 'USD' | 'EUR',
        prices_include_vat: invoiceDetails.pricesIncludeVat,
        line_items: invoiceDetails.lineItems.map((i) => ({
          sku: i.sku,
          description: i.description,
          quantity: i.quantity,
          price: i.price,
        })),
        discount_amount: invoiceDetails.discountAmount,
        discount_percent: invoiceDetails.discountPercent,
        // transaction_invoice has no VAT by Israeli accounting law
        vat_exempt: mappedType === 'transaction_invoice' ? true : invoiceDetails.vatExempt,
        round_total: invoiceDetails.roundTotal,
        payment_terms: invoiceDetails.paymentTerms,
        customer_notes: invoiceDetails.customerNotes,
        internal_notes: invoiceDetails.internalNotes,
        payment_methods: invoiceDetails.paymentMethods,
      },
    };
  }

  return (
    <>
    <ConfirmDialog
      isOpen={showCloseConfirm}
      onClose={() => setShowCloseConfirm(false)}
      onConfirm={(confirmed) => {
        setShowCloseConfirm(false);
        if (confirmed) close();
      }}
      title="סגירת המסמך"
      message="האם למחוק את המסמך? הנתונים שהזנת לא יישמרו."
      confirmText="מחק"
      cancelText="המשך עריכה"
      type="warning"
    />
    <div
      className={styles.overlay}
      dir="rtl"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setShowCloseConfirm(true);
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-document-dialog-title"
      >
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <button
              type="button"
              className={styles.closeButton}
              onClick={close}
              aria-label="סגור"
            >
              <X size={20} />
            </button>
            <h2 id="new-document-dialog-title" className={styles.title}>
              {docType ?? 'מסמך חדש'}
            </h2>
          </div>

          <ol className={styles.stepper}>
            {steps.map(({ id, label }, idx) => {
              const status = getStepStatus(id, currentStep, steps);
              const nextStep = steps[idx + 1];
              const lineActive = nextStep
                ? getStepStatus(nextStep.id, currentStep, steps) !== 'pending'
                : false;
              const isLast = idx === steps.length - 1;

              return (
                <li
                  key={id}
                  className={styles.stepperItem}
                  aria-current={status === 'active' ? 'step' : undefined}
                >
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
                      <span
                        className={`${styles.stepCircle} ${
                          status === 'active'
                            ? styles.stepCircleActive
                            : styles.stepCirclePending
                        }`}
                      >
                        {idx + 1}
                      </span>
                    )}
                    <span
                      className={`${styles.stepLabel} ${
                        status === 'active' ? styles.stepLabelActive : ''
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  {!isLast && (
                    <span
                      className={`${styles.stepperLine} ${
                        lineActive ? styles.stepperLineActive : ''
                      }`}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <div className={styles.body}>
          {currentStep === 'clientType' && (
            <ClientTypeStep clientType={clientType} onSelect={setClientType} />
          )}
          {currentStep === 'businessClientDetails' && (
            <BusinessClientStep
              formData={businessFormData}
              selectedBusinessCustomerId={businessCustomerId}
              onFormChange={setBusinessFormData}
              onSelectExisting={(customer) => {
                setBusinessCustomerId(customer.id);
                setBusinessFormData({
                  first_name: customer.first_name,
                  last_name: customer.last_name,
                  email: customer.email,
                  phone: customer.phone,
                  id_number: customer.id_number || customer.company_number,
                  company_number: customer.company_number,
                  address: customer.address ?? '',
                  business_type: customer.business_type,
                  category: customer.category,
                  notes: customer.notes,
                });
              }}
              onClearSelection={() => {
                setBusinessCustomerId(null);
                setBusinessFormData({
                  first_name: '',
                  last_name: '',
                  email: '',
                  phone: '',
                  id_number: '',
                  company_number: '',
                  address: '',
                  business_type: '',
                  category: '',
                  notes: '',
                });
              }}
            />
          )}
          {currentStep === 'selectCustomer' && (
            <ExistingCustomerStep
              customers={customers}
              selectedCustomerId={selectedCustomerId}
              onSelect={setSelectedCustomerId}
            />
          )}
          {currentStep === 'docType' && (
            <DocTypeStep docType={docType} clientType={clientType} onSelect={setDocType} />
          )}
          {currentStep === 'selectBranch' && (
            <SelectBranchStep
              branches={Array.isArray(branchesData) ? branchesData : []}
              selectedBranchId={selectedBranchId}
              onSelect={setSelectedBranchId}
            />
          )}
          {currentStep === 'documentDetails' &&
            (docType === 'חשבונית מס' || docType === 'חשבונית מס/קבלה') && (
              <InvoiceDetailsStep
                data={invoiceDetails}
                onChange={setInvoiceDetails}
                docType={docType}
              />
            )}
          {currentStep === 'documentDetails' && docType === 'קבלה' && (
            <ReceiptDetailsStep
              data={receiptDetails}
              onChange={setReceiptDetails}
              childId={clientType === 'existing' ? selectedCustomerId : null}
              businessCustomerId={clientType === 'business' ? businessCustomerId : null}
            />
          )}
          {currentStep === 'documentDetails' && docType === 'חשבונית עסקה' && (
            <TransactionInvoiceStep data={invoiceDetails} onChange={setInvoiceDetails} />
          )}
          {currentStep === 'documentDetails' && docType === 'חשבונית מס זיכוי' && (
            <CreditInvoiceStep
              data={creditInvoiceDetails}
              onChange={setCreditInvoiceDetails}
              childId={clientType === 'existing' ? selectedCustomerId : null}
              businessCustomerId={clientType === 'business' ? businessCustomerId : null}
            />
          )}

          {currentStep === 'summary' && (
            <SummaryStep
              clientType={clientType}
              docType={docType}
              customer={selectedCustomer}
              businessFormData={businessFormData}
              businessCustomerId={businessCustomerId}
              invoiceDetails={invoiceDetails}
            />
          )}
        </div>

        <div className={styles.footer}>
          {submitError && (
            <p className={styles.submitError}>{submitError}</p>
          )}
          {!isFirstStep ? (
            <button
              type="button"
              className={`${styles.navButton} ${styles.navButtonSecondary}`}
              onClick={goBack}
              disabled={isSubmitting}
            >
              <ChevronRight size={16} />
              חזור
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className={`${styles.navButton} ${styles.navButtonPrimary}`}
            onClick={handleNext}
            disabled={!canAdvance || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 size={16} className={styles.spinnerIcon} />
            ) : (
              <>
                {getNextButtonLabel(currentStep, steps)}
                {!isLastStep && <ChevronLeft size={16} />}
              </>
            )}
          </button>
        </div>
      </div>
      {showSuccess && (
        <div className={styles.successOverlay} role="status" aria-live="polite">
          <span className={styles.successMessage}>בוצע בהצלחה ✓</span>
        </div>
      )}
    </div>
    </>
  );
}

/* ─── Step sub-components ─────────────────────────────────────────── */

interface SelectableCardProps {
  icon: IconComponent;
  title: string;
  description: string;
  selected: boolean;
  iconDanger?: boolean;
  onSelect: () => void;
}

function SelectableCard({
  icon: Icon,
  title,
  description,
  selected,
  iconDanger,
  onSelect,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`${styles.selectableCard} ${selected ? styles.selectableCardSelected : ''}`}
      onClick={onSelect}
    >
      <span
        className={`${styles.cardIconWrap} ${selected ? styles.cardIconWrapSelected : iconDanger ? styles.cardIconWrapDanger : ''}`}
      >
        <Icon
          size={24}
          className={selected ? styles.cardIconSelected : iconDanger ? styles.cardIconDanger : styles.cardIcon}
        />
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
      <div className={`${styles.cardGrid} ${styles.cardGridTwoCol}`} role="radiogroup" aria-label="סוג לקוח">
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

/* ─── BusinessClientStep ─────────────────────────────────────────── */

interface BusinessClientStepProps {
  formData: BusinessCustomerFormData;
  selectedBusinessCustomerId: string | null;
  onFormChange: (data: BusinessCustomerFormData) => void;
  onSelectExisting: (customer: BusinessCustomer) => void;
  onClearSelection: () => void;
}

function BusinessClientStep({
  formData,
  selectedBusinessCustomerId,
  onFormChange,
  onSelectExisting,
  onClearSelection,
}: BusinessClientStepProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BusinessCustomer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedCustomerName =
    selectedBusinessCustomerId !== null
      ? `${formData.first_name} ${formData.last_name}`.trim()
      : null;

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearchQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim() === '') {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchBusinessCustomers(value.trim());
        setSearchResults(results);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }

  function handleSelectResult(customer: BusinessCustomer) {
    setSearchQuery(customer.full_name);
    setShowDropdown(false);
    setSearchResults([]);
    onSelectExisting(customer);
  }

  function handleClearSelection() {
    setSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);
    onClearSelection();
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function updateField(field: keyof BusinessCustomerFormData, value: string) {
    onFormChange({ ...formData, [field]: value });
  }

  return (
    <div>
      <p className={styles.stepSubtitle}>
        תוכל לחפש לקוח עסקי קיים או להזין פרטי לקוח חדש
      </p>

      {/* Search */}
      <div className={styles.searchSection}>
        <label htmlFor="biz-search" className={styles.fieldLabel}>
          שם לקוח
        </label>
        <div className={styles.searchWrapper} ref={wrapperRef}>
          <input
            id="biz-search"
            type="text"
            role="combobox"
            aria-expanded={showDropdown}
            aria-haspopup="listbox"
            aria-controls="biz-search-listbox"
            aria-autocomplete="list"
            className={`${styles.searchInput} ${
              selectedBusinessCustomerId !== null ? styles.searchInputSelected : ''
            }`}
            placeholder="חיפוש לקוח קיים או הזנת שם חדש..."
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => {
              if (searchResults.length > 0) setShowDropdown(true);
            }}
            autoComplete="off"
          />
          {isSearching ? (
            <span className={styles.searchIcon} aria-hidden="true">
              <Loader2 size={16} className={styles.spinnerIcon} />
            </span>
          ) : (
            <span className={styles.searchIcon} aria-hidden="true">
              <Search size={16} />
            </span>
          )}
          {selectedBusinessCustomerId !== null && (
            <button
              type="button"
              className={styles.searchClearBtn}
              onClick={handleClearSelection}
              aria-label="נקה בחירה"
            >
              <X size={14} />
            </button>
          )}

          {showDropdown && (
            <ul
              id="biz-search-listbox"
              role="listbox"
              className={styles.searchDropdown}
            >
              {searchResults.length === 0 ? (
                <li className={styles.searchDropdownEmpty} role="option" aria-selected={false}>
                  לא נמצאו לקוחות
                </li>
              ) : (
                searchResults.slice(0, 5).map((customer) => (
                  <li
                    key={customer.id}
                    role="option"
                    aria-selected={false}
                    className={styles.searchDropdownItem}
                    onMouseDown={() => handleSelectResult(customer)}
                  >
                    <span className={styles.searchDropdownItemName}>
                      {customer.full_name}
                    </span>
                    {customer.company_number && (
                      <span className={styles.searchDropdownItemMeta}>
                        ח.פ: {customer.company_number}
                      </span>
                    )}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Selected badge */}
      {selectedCustomerName && (
        <div className={styles.selectedCustomerBadge}>
          <span className={styles.selectedCustomerBadgeText}>
            לקוח קיים: {selectedCustomerName}
          </span>
          <button
            type="button"
            className={styles.selectedCustomerBadgeClear}
            onClick={handleClearSelection}
            aria-label="נקה בחירה"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Form grid */}
      <div className={styles.businessFormGrid}>
        <div className={styles.formRow}>
          <label htmlFor="biz-first-name" className={styles.fieldLabel}>
            שם פרטי
          </label>
          <input
            id="biz-first-name"
            type="text"
            className={styles.formInput}
            value={formData.first_name}
            onChange={(e) => updateField('first_name', e.target.value)}
            aria-required="true"
          />
        </div>

        <div className={styles.formRow}>
          <label htmlFor="biz-last-name" className={styles.fieldLabel}>
            שם משפחה
          </label>
          <input
            id="biz-last-name"
            type="text"
            className={styles.formInput}
            value={formData.last_name}
            onChange={(e) => updateField('last_name', e.target.value)}
            aria-required="true"
          />
        </div>

        <div className={styles.formRow}>
          <label htmlFor="biz-email" className={styles.fieldLabel}>
            אימייל
          </label>
          <input
            id="biz-email"
            type="email"
            className={styles.formInput}
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value)}
          />
        </div>

        <div className={styles.formRow}>
          <label htmlFor="biz-phone" className={styles.fieldLabel}>
            טלפון
          </label>
          <input
            id="biz-phone"
            type="tel"
            className={styles.formInput}
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value)}
          />
        </div>

        <div className={styles.formRow}>
          <label htmlFor="biz-id-number" className={styles.fieldLabel}>
            ת.ז/ח.פ
          </label>
          <input
            id="biz-id-number"
            type="text"
            className={styles.formInput}
            value={formData.id_number}
            onChange={(e) => updateField('id_number', e.target.value)}
          />
        </div>

        <div className={styles.formRow}>
          <label htmlFor="biz-address" className={styles.fieldLabel}>
            כתובת
          </label>
          <input
            id="biz-address"
            type="text"
            className={styles.formInput}
            value={formData.address}
            onChange={(e) => updateField('address', e.target.value)}
          />
        </div>

        <div className={styles.formRow}>
          <label htmlFor="biz-business-type" className={styles.fieldLabel}>
            שיוך לעסק
          </label>
          <Select
            id="biz-business-type"
            className={styles.formSelect}
            value={formData.business_type}
            onChange={(e) => updateField('business_type', e.target.value)}
          >
            <option value="">בחר סוג עסק</option>
            {BUSINESS_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </div>

        <div className={styles.formRow}>
          <label htmlFor="biz-category" className={styles.fieldLabel}>
            קטגוריה
          </label>
          <Select
            id="biz-category"
            className={styles.formSelect}
            value={formData.category}
            onChange={(e) => updateField('category', e.target.value)}
          >
            <option value="">בחר קטגוריה</option>
            {BUSINESS_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </div>

        <div className={`${styles.formRow} ${styles.formRowFull}`}>
          <label htmlFor="biz-notes" className={styles.fieldLabel}>
            הערות
          </label>
          <textarea
            id="biz-notes"
            className={styles.formTextarea}
            value={formData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── ExistingCustomerStep ────────────────────────────────────────── */

interface ExistingCustomerStepProps {
  customers: ChildWithDetails[];
  selectedCustomerId: string | null;
  onSelect: (id: string) => void;
}

function ExistingCustomerStep({
  customers,
  selectedCustomerId,
  onSelect,
}: ExistingCustomerStepProps) {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null;

  const filtered = useMemo(() => {
    if (!query.trim()) return customers.slice(0, 8);
    const q = query.toLowerCase();
    return customers.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        (c.family_phone && c.family_phone.includes(q)) ||
        (c.parent_phone && c.parent_phone.includes(q))
    ).slice(0, 8);
  }, [query, customers]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(customer: ChildWithDetails) {
    onSelect(customer.id);
    setQuery(getCustomerLabel(customer));
    setShowDropdown(false);
  }

  function handleClear() {
    onSelect('');
    setQuery('');
    setShowDropdown(false);
  }

  return (
    <div>
      <p className={styles.stepSubtitle}>חפש לקוח לפי שם או טלפון</p>
      <div className={styles.searchSection}>
        <label htmlFor="existing-customer-search" className={styles.fieldLabel}>
          לקוח קיים
        </label>
        <div className={styles.searchWrapper} ref={wrapperRef}>
          <input
            id="existing-customer-search"
            type="text"
            role="combobox"
            aria-expanded={showDropdown}
            aria-haspopup="listbox"
            aria-controls="existing-customer-listbox"
            aria-autocomplete="list"
            className={`${styles.searchInput} ${selectedCustomerId ? styles.searchInputSelected : ''}`}
            placeholder="חיפוש לפי שם או טלפון..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            autoComplete="off"
          />
          <span className={styles.searchIcon} aria-hidden="true">
            <Search size={16} />
          </span>
          {selectedCustomerId && (
            <button
              type="button"
              className={styles.searchClearBtn}
              onClick={handleClear}
              aria-label="נקה בחירה"
            >
              <X size={14} />
            </button>
          )}
          {showDropdown && (
            <ul id="existing-customer-listbox" role="listbox" className={styles.searchDropdown}>
              {filtered.length === 0 ? (
                <li className={styles.searchDropdownEmpty} role="option" aria-selected={false}>
                  לא נמצאו לקוחות
                </li>
              ) : (
                filtered.map((customer) => (
                  <li
                    key={customer.id}
                    role="option"
                    aria-selected={customer.id === selectedCustomerId}
                    className={styles.searchDropdownItem}
                    onMouseDown={() => handleSelect(customer)}
                  >
                    <span className={styles.searchDropdownItemName}>{customer.full_name}</span>
                    {(customer.family_phone || customer.parent_phone) && (
                      <span className={styles.searchDropdownItemMeta}>
                        {customer.family_phone || customer.parent_phone}
                      </span>
                    )}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>
      {selectedCustomer && (
        <div className={styles.selectedCustomerBadge}>
          <span className={styles.selectedCustomerBadgeText}>
            לקוח נבחר: {getCustomerLabel(selectedCustomer)}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── DocTypeStep ─────────────────────────────────────────────────── */

interface DocTypeStepProps {
  docType: string | null;
  clientType: ClientType | null;
  onSelect: (type: string) => void;
}

function DocTypeStep({ docType, clientType: _clientType, onSelect }: DocTypeStepProps) {
  const options = DOCUMENT_TYPE_OPTIONS;
  return (
    <div>
      <p className={styles.stepSubtitle}>בחר את סוג המסמך שברצונך להפיק</p>
      <div className={styles.cardGrid} role="radiogroup" aria-label="סוג מסמך">
        {options.map((option) => (
          <SelectableCard
            key={option.type}
            icon={DOCUMENT_TYPE_ICONS[option.type] ?? FileText}
            title={option.type}
            description={option.description}
            selected={docType === option.type}
            iconDanger={DOCUMENT_TYPE_DANGER.has(option.type)}
            onSelect={() => onSelect(option.type)}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── SelectBranchStep ───────────────────────────────────────────── */

interface SelectBranchStepProps {
  branches: { id: string; name: string }[];
  selectedBranchId: string | null;
  onSelect: (id: string | null) => void;
}

function SelectBranchStep({ branches, selectedBranchId, onSelect }: SelectBranchStepProps) {
  return (
    <div>
      <p className={styles.stepSubtitle}>בחר את הסניף המשויך למסמך (שדה חובה)</p>
      <div className={styles.cardGrid} role="radiogroup" aria-label="בחירת סניף">
        {branches.map((branch) => (
          <SelectableCard
            key={branch.id}
            icon={Building2}
            title={branch.name}
            description=""
            selected={selectedBranchId === branch.id}
            onSelect={() => onSelect(branch.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── TransactionInvoiceStep ──────────────────────────────────────── */

interface TransactionInvoiceStepProps {
  data: InvoiceDetailsData;
  onChange: (data: InvoiceDetailsData) => void;
}

function TransactionInvoiceStep({ data, onChange }: TransactionInvoiceStepProps) {
  function updateLineItem(idx: number, field: keyof LineItem, value: string | number) {
    const updated = data.lineItems.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    );
    onChange({ ...data, lineItems: updated });
  }

  const subtotal = data.lineItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
  // חשבונית עסקה is a non-VAT document by Israeli accounting law
  const totalBeforeRounding = subtotal - data.discountAmount;
  const finalTotal = data.roundTotal ? Math.round(totalBeforeRounding) : totalBeforeRounding;

  return (
    <div>
      {/* Header row — doc number + date */}
      <div className={styles.detailsHeaderRow}>
        <div className={styles.detailsCol}>
          <label className={styles.fieldLabel}>מספר למסמך</label>
          <input
            type="text"
            className={styles.readOnlyInput}
            value={data.documentNumber}
            readOnly
            aria-readonly="true"
            aria-label="מספר מסמך"
          />
        </div>
        <div className={styles.detailsCol}>
          <label htmlFor="txn-date" className={styles.fieldLabel}>
            תאריך למסמך
          </label>
          <input
            id="txn-date"
            type="date"
            className={styles.formInput}
            value={data.documentDate}
            onChange={(e) => onChange({ ...data, documentDate: e.target.value })}
          />
        </div>
      </div>

      {/* פרטים */}
      <div className={styles.detailsSection}>
        <label htmlFor="txn-description" className={styles.sectionHeading}>
          פרטים <span className={styles.requiredMark}>*</span>
        </label>
        <textarea
          id="txn-description"
          className={styles.formTextarea}
          placeholder="תיאור העסקה / השירותות..."
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          aria-required="true"
        />
      </div>

      {/* מטבע */}
      <div className={styles.detailsSection}>
        <span className={styles.sectionHeading}>מטבע</span>
        <div className={styles.currencyRow}>
          <Select
            value={data.currency}
            onChange={(e) => onChange({ ...data, currency: e.target.value })}
            className={styles.currencySelect}
          >
            <option value="ILS">שקל ₪</option>
            <option value="USD">דולר $</option>
            <option value="EUR">אירו €</option>
          </Select>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={data.pricesIncludeVat}
              onChange={(e) => onChange({ ...data, pricesIncludeVat: e.target.checked })}
            />
            הזנת מחירים כוללים מע&quot;מ
          </label>
        </div>
      </div>

      {/* שורות פריטים */}
      <div className={styles.detailsSection}>
        <span className={styles.sectionHeading}>שורות פריטים</span>
        <div className={styles.lineItemsTableWrap}>
          <div className={styles.lineItemsTable} role="table">
            <div className={styles.lineItemsHeaderRow} role="row">
              <div className={styles.lineItemHeaderCell} role="columnheader" />
              <div className={styles.lineItemHeaderCell} role="columnheader">מק&quot;ט</div>
              <div className={styles.lineItemHeaderCell} role="columnheader">תיאור</div>
              <div className={styles.lineItemHeaderCell} role="columnheader">כמות</div>
              <div className={styles.lineItemHeaderCell} role="columnheader">מחיר</div>
              <div className={styles.lineItemHeaderCell} role="columnheader">סה&quot;כ</div>
            </div>
            {data.lineItems.map((item, idx) => (
              <div key={item.id} className={styles.lineItemRow} role="row">
                <button
                  type="button"
                  className={styles.lineItemDeleteBtn}
                  onClick={() =>
                    onChange({ ...data, lineItems: data.lineItems.filter((_, i) => i !== idx) })
                  }
                  aria-label="מחק שורה"
                >
                  <X size={14} />
                </button>
                <input
                  type="text"
                  className={styles.lineItemInput}
                  value={item.sku}
                  placeholder='מק"ט'
                  onChange={(e) => updateLineItem(idx, 'sku', e.target.value)}
                />
                <input
                  type="text"
                  className={`${styles.lineItemInput} ${styles.lineItemDescInput}`}
                  value={item.description}
                  placeholder="תיאור"
                  onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                />
                <input
                  type="number"
                  className={styles.lineItemInput}
                  value={item.quantity}
                  min={1}
                  onChange={(e) => updateLineItem(idx, 'quantity', Number(e.target.value))}
                />
                <input
                  type="number"
                  className={styles.lineItemInput}
                  value={item.price}
                  min={0}
                  step={0.01}
                  onChange={(e) => updateLineItem(idx, 'price', Number(e.target.value))}
                />
                <div className={styles.lineItemTotal} role="cell">
                  ₪{(item.quantity * item.price).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          className={styles.addRowBtn}
          onClick={() =>
            onChange({
              ...data,
              lineItems: [
                ...data.lineItems,
                { id: String(Date.now()), sku: '', description: '', quantity: 1, price: 0 },
              ],
            })
          }
        >
          + הוסף שורה
        </button>
      </div>

      {/* Totals */}
      <div className={styles.totalsSection}>
        <div className={styles.totalsRow}>
          <span className={styles.totalsLabel}>סה&quot;כ</span>
          <span className={styles.totalsValue}>₪{subtotal.toFixed(2)}</span>
        </div>

        <div className={`${styles.totalsRow} ${styles.discountRow}`}>
          <span className={styles.totalsLabel}>הנחה לפני מע&quot;מ</span>
          <div className={styles.discountInputRow}>
            <input
              type="number"
              className={styles.discountInput}
              value={data.discountAmount}
              min={0}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange({ ...data, discountAmount: val, discountPercent: val > 0 ? 0 : data.discountPercent });
              }}
              aria-label="סכום הנחה בשקלים"
            />
            <span className={styles.discountLabel}>₪</span>
            <input
              type="number"
              className={styles.discountInput}
              value={data.discountPercent}
              min={0}
              max={100}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange({ ...data, discountPercent: val, discountAmount: val > 0 ? 0 : data.discountAmount });
              }}
              aria-label="אחוז הנחה"
            />
            <span className={styles.discountLabel}>%</span>
          </div>
        </div>

        <div className={`${styles.totalsRow} ${styles.totalsRowBold}`}>
          <span className={styles.totalsLabel}>סה&quot;כ בח&quot;ן</span>
          <span className={styles.totalsValue}>₪{finalTotal.toFixed(2)}</span>
        </div>

        <label className={styles.totalsCheckboxRow}>
          <input
            type="checkbox"
            checked={data.roundTotal}
            onChange={(e) => onChange({ ...data, roundTotal: e.target.checked })}
          />
          <span className={styles.totalsCheckboxLabel}>עגל סכום - ללא אגורות</span>
        </label>
      </div>

      {/* Info banner */}
      <div className={styles.infoBanner}>
        <FileText size={16} className={styles.infoBannerIcon} />
        <span className={styles.infoBannerText}>
          חשבונית עסקה – דרישת תשלום. אינה כוללת תשלום בפועל. אינה כוללת מע&quot;מ.
        </span>
      </div>

      {/* לסגור חשבונית */}
      <label className={`${styles.totalsCheckboxRow} ${styles.closeInvoiceRow}`}>
        <input
          type="checkbox"
          checked={data.closeInvoice}
          onChange={(e) => onChange({ ...data, closeInvoice: e.target.checked })}
        />
        <span className={styles.totalsCheckboxLabel}>לסגור חשבונית</span>
      </label>

      {/* Notes — two columns */}
      <div className={styles.notesGrid}>
        <div className={styles.formRow}>
          <label htmlFor="txn-customer-notes" className={styles.sectionHeading}>הערות</label>
          <textarea
            id="txn-customer-notes"
            className={styles.formTextarea}
            placeholder="הערות ללקוח..."
            value={data.customerNotes}
            onChange={(e) => onChange({ ...data, customerNotes: e.target.value })}
          />
        </div>
        <div className={styles.formRow}>
          <label htmlFor="txn-internal-notes" className={styles.sectionHeading}>הערה פנימית</label>
          <textarea
            id="txn-internal-notes"
            className={styles.formTextarea}
            placeholder="הערה פנימית (לא מופיעה במסמך)..."
            value={data.internalNotes}
            onChange={(e) => onChange({ ...data, internalNotes: e.target.value })}
          />
        </div>
      </div>

      {/* Payment terms */}
      <div className={styles.paymentTermsRow}>
        <div className={styles.formRow}>
          <label htmlFor="txn-payment-terms" className={styles.sectionHeading}>לתשלום עד</label>
          <Select
            id="txn-payment-terms"
            className={styles.formSelect}
            value={data.paymentTerms}
            onChange={(e) => onChange({ ...data, paymentTerms: e.target.value })}
          >
            <option value="מיידי">מיידי</option>
            <option value="שוטף">שוטף</option>
            <option value="שוטף + 15">שוטף + 15</option>
            <option value="שוטף + 30">שוטף + 30</option>
            <option value="שוטף + 45">שוטף + 45</option>
            <option value="שוטף + 60">שוטף + 60</option>
            <option value="שוטף + 90">שוטף + 90</option>
          </Select>
        </div>
        <div className={styles.formRow}>
          <label htmlFor="txn-due-date" className={styles.sectionHeading}>תאריך פירעון</label>
          <input
            id="txn-due-date"
            type="date"
            className={styles.formInput}
            value={data.dueDate}
            min={data.documentDate || undefined}
            onChange={(e) => onChange({ ...data, dueDate: e.target.value })}
          />
          {data.dueDate && data.documentDate && data.dueDate < data.documentDate && (
            <p className={styles.fieldError}>תאריך הפירעון חייב להיות שווה או מאוחר מתאריך המסמך</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── CreditInvoiceStep ───────────────────────────────────────────── */

interface CreditInvoiceStepProps {
  data: CreditInvoiceData;
  onChange: (data: CreditInvoiceData) => void;
  childId?: string | null;
  businessCustomerId?: string | null;
}

function CreditInvoiceStep({ data, onChange, childId, businessCustomerId }: CreditInvoiceStepProps) {
  const vatAmount = data.vatExempt ? 0 : data.creditAmountBeforeVat * 0.18;
  const totalCredit = data.creditAmountBeforeVat + vatAmount;

  const { data: openInvoices = [] } = useQuery({
    queryKey: ['formal-documents', 'open', childId, businessCustomerId],
    queryFn: () => fetchDocuments({
      exclude_credits: true,
      ...(childId ? { child_id: childId } : {}),
      ...(businessCustomerId ? { business_customer_id: businessCustomerId } : {}),
    }),
    staleTime: 60_000,
  });

  return (
    <div>
      {/* Header row — doc number + date */}
      <div className={styles.detailsHeaderRow}>
        <div className={styles.detailsCol}>
          <label className={styles.fieldLabel}>מספר למסמך</label>
          <input
            type="text"
            className={styles.readOnlyInput}
            value={data.documentNumber}
            readOnly
            aria-readonly="true"
            aria-label="מספר מסמך"
          />
        </div>
        <div className={styles.detailsCol}>
          <label htmlFor="credit-date" className={styles.fieldLabel}>
            תאריך למסמך
          </label>
          <input
            id="credit-date"
            type="date"
            className={styles.formInput}
            value={data.documentDate}
            onChange={(e) => onChange({ ...data, documentDate: e.target.value })}
          />
        </div>
      </div>

      {/* בחר חשבונית לזיכוי */}
      <div className={styles.detailsSection}>
        <label htmlFor="credit-linked-invoice" className={styles.sectionHeading}>
          מספר חשבונית לזיכוי <span className={styles.requiredMark}>*</span>
        </label>
        {openInvoices.length > 0 ? (
          <Select
            id="credit-linked-invoice"
            className={styles.formSelect}
            value={data.linkedInvoiceId}
            onChange={(e) => onChange({ ...data, linkedInvoiceId: e.target.value })}
            aria-required="true"
          >
            <option value="">בחר חשבונית לזיכוי</option>
            {openInvoices.map((inv) => (
              <option key={inv.id} value={inv.document_number}>
                {inv.document_number} — ₪{inv.total_amount} ({inv.document_date})
              </option>
            ))}
          </Select>
        ) : (
          <input
            id="credit-linked-invoice"
            type="text"
            className={styles.formInput}
            placeholder="הזן מספר חשבונית (לדוגמה: INV-2025-1234)"
            value={data.linkedInvoiceId}
            onChange={(e) => onChange({ ...data, linkedInvoiceId: e.target.value })}
            aria-required="true"
          />
        )}
      </div>

      {/* סיבת הזיכוי */}
      <div className={styles.detailsSection}>
        <label htmlFor="credit-reason" className={styles.sectionHeading}>
          סיבת הזיכוי <span className={styles.requiredMark}>*</span>
        </label>
        <textarea
          id="credit-reason"
          className={styles.formTextarea}
          placeholder="תאר את סיבת הזיכוי..."
          value={data.creditReason}
          onChange={(e) => onChange({ ...data, creditReason: e.target.value })}
          aria-required="true"
        />
      </div>

      {/* סה"כ זיכוי לפני מע"מ */}
      <div className={styles.detailsSection}>
        <label htmlFor="credit-amount" className={styles.sectionHeading}>
          סה&quot;כ זיכוי (לפני מע&quot;מ)
        </label>
        <input
          id="credit-amount"
          type="number"
          min={0}
          step={0.01}
          className={`${styles.formInput} ${styles.creditAmountInput}`}
          value={data.creditAmountBeforeVat}
          onChange={(e) => onChange({ ...data, creditAmountBeforeVat: Number(e.target.value) })}
          aria-label="סכום זיכוי לפני מע״מ"
        />
      </div>

      {/* Totals */}
      <div className={styles.totalsSection}>
        <div className={styles.totalsRow}>
          <span className={styles.totalsLabel}>סה&quot;כ זיכוי לפני מע&quot;מ</span>
          <span className={styles.totalsValue}>₪{data.creditAmountBeforeVat.toFixed(2)}</span>
        </div>
        <div className={styles.vatRow}>
          <span className={styles.totalsLabel}>מע&quot;מ 18%</span>
          <div className={styles.vatRowContent}>
            <label className={styles.vatRadioLabel}>
              <input
                type="checkbox"
                checked={data.vatExempt}
                onChange={(e) => onChange({ ...data, vatExempt: e.target.checked })}
              />
              ללא מע&quot;מ (אילת / חו&quot;ל)
            </label>
            <span className={styles.vatAmount}>₪{vatAmount.toFixed(2)}</span>
          </div>
        </div>
        <div className={`${styles.totalsRow} ${styles.totalsRowBold}`}>
          <span className={styles.totalsLabel}>סה&quot;כ זיכוי</span>
          <span className={styles.creditTotalValue}>₪{totalCredit.toFixed(2)}-</span>
        </div>
      </div>

      {/* Notes — two columns */}
      <div className={styles.notesGrid}>
        <div className={styles.formRow}>
          <label htmlFor="credit-customer-notes" className={styles.sectionHeading}>הערות</label>
          <textarea
            id="credit-customer-notes"
            className={styles.formTextarea}
            placeholder="הערות ללקוח..."
            value={data.customerNotes}
            onChange={(e) => onChange({ ...data, customerNotes: e.target.value })}
          />
        </div>
        <div className={styles.formRow}>
          <label htmlFor="credit-internal-notes" className={styles.sectionHeading}>הערה פנימית</label>
          <textarea
            id="credit-internal-notes"
            className={styles.formTextarea}
            placeholder="הערה פנימית (לא מופיעה במסמך)..."
            value={data.internalNotes}
            onChange={(e) => onChange({ ...data, internalNotes: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}


/* ─── InvoiceDetailsStep ──────────────────────────────────────────── */

interface InvoiceDetailsStepProps {
  data: InvoiceDetailsData;
  onChange: (data: InvoiceDetailsData) => void;
  docType: string;
}

function InvoiceDetailsStep({ data, onChange, docType }: InvoiceDetailsStepProps) {
  const isReceipt = docType === 'חשבונית מס/קבלה';

  function togglePaymentMethod(method: string) {
    const methods = data.paymentMethods.includes(method)
      ? data.paymentMethods.filter((m) => m !== method)
      : [...data.paymentMethods, method];
    onChange({ ...data, paymentMethods: methods });
  }
  function updateLineItem(idx: number, field: keyof LineItem, value: string | number) {
    const updated = data.lineItems.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    );
    onChange({ ...data, lineItems: updated });
  }

  const subtotal = data.lineItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const vatAmount = data.vatExempt ? 0 : (subtotal - data.discountAmount) * 0.18;
  const totalBeforeRounding = subtotal - data.discountAmount + vatAmount;
  const finalTotal = data.roundTotal ? Math.round(totalBeforeRounding) : totalBeforeRounding;

  return (
    <div>
      {/* Row 1 — doc number + date */}
      <div className={styles.detailsHeaderRow}>
        <div className={styles.detailsCol}>
          <label className={styles.fieldLabel}>מספר למסמך</label>
          <input
            type="text"
            className={styles.readOnlyInput}
            value={data.documentNumber}
            readOnly
            aria-readonly="true"
            aria-label="מספר מסמך"
          />
        </div>
        <div className={styles.detailsCol}>
          <label htmlFor="inv-date" className={styles.fieldLabel}>
            תאריך למסמך
          </label>
          <input
            id="inv-date"
            type="date"
            className={styles.formInput}
            value={data.documentDate}
            onChange={(e) => onChange({ ...data, documentDate: e.target.value })}
          />
        </div>
      </div>

      {/* פרטים */}
      <div className={styles.detailsSection}>
        <label htmlFor="inv-description" className={styles.sectionHeading}>
          פרטים <span className={styles.requiredMark}>*</span>
        </label>
        <textarea
          id="inv-description"
          className={styles.formTextarea}
          placeholder="תיאור העסקה / השירות..."
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          aria-required="true"
        />
      </div>

      {/* מטבע */}
      <div className={styles.detailsSection}>
        <span className={styles.sectionHeading}>מטבע</span>
        <div className={styles.currencyRow}>
          <Select
            value={data.currency}
            onChange={(e) => onChange({ ...data, currency: e.target.value })}
            className={styles.currencySelect}
          >
            <option value="ILS">שקל ₪</option>
            <option value="USD">דולר $</option>
            <option value="EUR">אירו €</option>
          </Select>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={data.pricesIncludeVat}
              onChange={(e) => onChange({ ...data, pricesIncludeVat: e.target.checked })}
            />
            מחירים כוללים מע&quot;מ
          </label>
        </div>
      </div>

      {/* שורות פריטים */}
      <div className={styles.detailsSection}>
        <span className={styles.sectionHeading}>שורות פריטים</span>
        <div className={styles.lineItemsTableWrap}>
          <div className={styles.lineItemsTable} role="table">
            <div className={styles.lineItemsHeaderRow} role="row">
              <div className={styles.lineItemHeaderCell} role="columnheader" />
              <div className={styles.lineItemHeaderCell} role="columnheader">
                מק&quot;ט
              </div>
              <div className={styles.lineItemHeaderCell} role="columnheader">
                תיאור
              </div>
              <div className={styles.lineItemHeaderCell} role="columnheader">
                כמות
              </div>
              <div className={styles.lineItemHeaderCell} role="columnheader">
                מחיר
              </div>
              <div className={styles.lineItemHeaderCell} role="columnheader">
                סה&quot;כ
              </div>
            </div>
            {data.lineItems.map((item, idx) => (
              <div key={item.id} className={styles.lineItemRow} role="row">
                <button
                  type="button"
                  className={styles.lineItemDeleteBtn}
                  onClick={() =>
                    onChange({
                      ...data,
                      lineItems: data.lineItems.filter((_, i) => i !== idx),
                    })
                  }
                  aria-label="מחק שורה"
                >
                  <X size={14} />
                </button>
                <input
                  type="text"
                  className={styles.lineItemInput}
                  value={item.sku}
                  placeholder='מק"ט'
                  onChange={(e) => updateLineItem(idx, 'sku', e.target.value)}
                />
                <input
                  type="text"
                  className={`${styles.lineItemInput} ${styles.lineItemDescInput}`}
                  value={item.description}
                  placeholder="תיאור"
                  onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                />
                <input
                  type="number"
                  className={styles.lineItemInput}
                  value={item.quantity}
                  min={1}
                  onChange={(e) => updateLineItem(idx, 'quantity', Number(e.target.value))}
                />
                <input
                  type="number"
                  className={styles.lineItemInput}
                  value={item.price}
                  min={0}
                  step={0.01}
                  onChange={(e) => updateLineItem(idx, 'price', Number(e.target.value))}
                />
                <div className={styles.lineItemTotal} role="cell">
                  ₪{(item.quantity * item.price).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          className={styles.addRowBtn}
          onClick={() =>
            onChange({
              ...data,
              lineItems: [
                ...data.lineItems,
                { id: String(Date.now()), sku: '', description: '', quantity: 1, price: 0 },
              ],
            })
          }
        >
          + הוסף שורה
        </button>
      </div>

      {/* Totals */}
      <div className={styles.totalsSection}>
        <div className={styles.totalsRow}>
          <span className={styles.totalsLabel}>סה&quot;כ</span>
          <span className={styles.totalsValue}>₪{subtotal.toFixed(2)}</span>
        </div>

        <div className={`${styles.totalsRow} ${styles.discountRow}`}>
          <span className={styles.totalsLabel}>הנחה לפני מע&quot;מ</span>
          <div className={styles.discountInputRow}>
            <input
              type="number"
              className={styles.discountInput}
              value={data.discountAmount}
              min={0}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange({ ...data, discountAmount: val, discountPercent: val > 0 ? 0 : data.discountPercent });
              }}
              aria-label="סכום הנחה בשקלים"
            />
            <span className={styles.discountLabel}>₪</span>
            <input
              type="number"
              className={styles.discountInput}
              value={data.discountPercent}
              min={0}
              max={100}
              onChange={(e) => {
                const val = Number(e.target.value);
                onChange({ ...data, discountPercent: val, discountAmount: val > 0 ? 0 : data.discountAmount });
              }}
              aria-label="אחוז הנחה"
            />
            <span className={styles.discountLabel}>%</span>
          </div>
        </div>

        <div className={styles.vatRow}>
          <span className={styles.totalsLabel}>מע&quot;מ 18%</span>
          <div className={styles.vatRowContent}>
            <label className={styles.vatRadioLabel}>
              <input
                type="checkbox"
                checked={data.vatExempt}
                onChange={(e) => onChange({ ...data, vatExempt: e.target.checked })}
              />
              ללא מע&quot;מ (אילת / חו&quot;ל)
            </label>
            <span className={styles.vatAmount}>₪{vatAmount.toFixed(2)}</span>
          </div>
        </div>

        <div className={`${styles.totalsRow} ${styles.totalsRowBold}`}>
          <span className={styles.totalsLabel}>סה&quot;כ בח&quot;ן</span>
          <span className={styles.totalsValue}>₪{finalTotal.toFixed(2)}</span>
        </div>

        <label className={styles.totalsCheckboxRow}>
          <input
            type="checkbox"
            checked={data.roundTotal}
            onChange={(e) => onChange({ ...data, roundTotal: e.target.checked })}
          />
          <span className={styles.totalsCheckboxLabel}>עגל סכום - ללא אגורות</span>
        </label>

        <label className={styles.totalsCheckboxRow}>
          <input
            type="checkbox"
            checked={data.closeInvoice}
            onChange={(e) => onChange({ ...data, closeInvoice: e.target.checked })}
          />
          <span className={styles.totalsCheckboxLabel}>לסגור חשבונית</span>
        </label>
      </div>

      {/* Notes — two columns */}
      <div className={styles.notesGrid}>
        <div className={styles.formRow}>
          <label htmlFor="inv-customer-notes" className={styles.sectionHeading}>הערות</label>
          <textarea
            id="inv-customer-notes"
            className={styles.formTextarea}
            placeholder="הערות ללקוח..."
            value={data.customerNotes}
            onChange={(e) => onChange({ ...data, customerNotes: e.target.value })}
          />
        </div>
        <div className={styles.formRow}>
          <label htmlFor="inv-internal-notes" className={styles.sectionHeading}>הערה פנימית</label>
          <textarea
            id="inv-internal-notes"
            className={styles.formTextarea}
            placeholder="הערה פנימית (לא מופיעה במסמך)..."
            value={data.internalNotes}
            onChange={(e) => onChange({ ...data, internalNotes: e.target.value })}
          />
        </div>
      </div>

      {/* Payment terms */}
      <div className={styles.paymentTermsRow}>
        <div className={styles.formRow}>
          <label htmlFor="inv-payment-terms" className={styles.sectionHeading}>לתשלום עד</label>
          <Select
            id="inv-payment-terms"
            className={styles.formSelect}
            value={data.paymentTerms}
            onChange={(e) => onChange({ ...data, paymentTerms: e.target.value })}
          >
            <option value="מיידי">מיידי</option>
            <option value="שוטף">שוטף</option>
            <option value="שוטף + 15">שוטף + 15</option>
            <option value="שוטף + 30">שוטף + 30</option>
            <option value="שוטף + 45">שוטף + 45</option>
            <option value="שוטף + 60">שוטף + 60</option>
            <option value="שוטף + 90">שוטף + 90</option>
          </Select>
        </div>
        <div className={styles.formRow}>
          <label htmlFor="inv-due-date" className={styles.sectionHeading}>תאריך פירעון</label>
          <input
            id="inv-due-date"
            type="date"
            className={styles.formInput}
            value={data.dueDate}
            min={data.documentDate || undefined}
            onChange={(e) => onChange({ ...data, dueDate: e.target.value })}
          />
          {data.dueDate && data.documentDate && data.dueDate < data.documentDate && (
            <p className={styles.fieldError}>תאריך הפירעון חייב להיות שווה או מאוחר מתאריך המסמך</p>
          )}
        </div>
      </div>

      {/* Payment methods */}
      {isReceipt && (
        <div className={styles.detailsSection}>
          <div className={styles.sectionDivider}>
            <span className={styles.sectionDividerLabel}>אמצעי תשלום</span>
          </div>
          <div className={styles.paymentMethodsGrid}>
            {PAYMENT_METHODS.map(({ id, label, icon: Icon }) => {
              const active = data.paymentMethods.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`${styles.paymentMethodBtn} ${active ? styles.paymentMethodBtnActive : ''}`}
                  onClick={() => togglePaymentMethod(id)}
                  aria-pressed={active}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Link to existing invoice */}
      {isReceipt && (
        <div className={styles.detailsSection}>
          <label htmlFor="inv-linked" className={styles.sectionHeading}>
            שיוך לחשבונית קיימת <span className={styles.optionalLabel}>(אופציונלי)</span>
          </label>
          <Select
            id="inv-linked"
            className={styles.formSelect}
            value={data.linkedInvoiceId}
            onChange={(e) => onChange({ ...data, linkedInvoiceId: e.target.value })}
          >
            <option value="">ללא שיוך</option>
          </Select>
        </div>
      )}

      {/* Receipt notes */}
      {isReceipt && (
        <div className={styles.detailsSection}>
          <label htmlFor="inv-receipt-notes" className={styles.sectionHeading}>הערות לקבלה</label>
          <textarea
            id="inv-receipt-notes"
            className={styles.formTextarea}
            placeholder="הערות נוספות..."
            value={data.receiptNotes}
            onChange={(e) => onChange({ ...data, receiptNotes: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

/* ─── ReceiptDetailsStep ──────────────────────────────────────────── */

interface ReceiptDetailsStepProps {
  data: ReceiptDetailsData;
  onChange: (data: ReceiptDetailsData) => void;
  childId?: string | null;
  businessCustomerId?: string | null;
}

function ReceiptDetailsStep({ data, onChange, childId, businessCustomerId }: ReceiptDetailsStepProps) {
  const { data: openInvoices = [] } = useQuery({
    queryKey: ['formal-documents', 'open', childId, businessCustomerId],
    queryFn: () => fetchDocuments({
      exclude_credits: true,
      ...(childId ? { child_id: childId } : {}),
      ...(businessCustomerId ? { business_customer_id: businessCustomerId } : {}),
    }),
    staleTime: 60_000,
  });

  return (
    <div>
      {/* Payment method tabs */}
      <div className={styles.detailsSection}>
        <p className={styles.sectionHeading}>אמצעי תשלום</p>
        <div
          className={styles.paymentMethodsGrid}
          role="group"
          aria-label="אמצעי תשלום"
        >
          {PAYMENT_METHODS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`${styles.paymentMethodBtn} ${
                data.paymentMethod === id ? styles.paymentMethodBtnActive : ''
              }`}
              aria-pressed={data.paymentMethod === id}
              onClick={() => onChange({ ...data, paymentMethod: id })}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Shared: שיוך לחשבונית קיימת */}
      <div className={styles.detailsSection}>
        <label htmlFor="receipt-linked" className={styles.sectionHeading}>
          שיוך לחשבונית קיימת{' '}
          <span className={styles.optionalLabel}>(אופציונלי)</span>
        </label>
        <Select
          id="receipt-linked"
          className={styles.formSelect}
          value={data.linkedInvoiceId}
          onChange={(e) => onChange({ ...data, linkedInvoiceId: e.target.value })}
        >
          <option value="">ללא שיוך</option>
          {openInvoices.map((inv) => (
            <option key={inv.id} value={inv.document_number}>
              {inv.document_number} — ₪{inv.total_amount} ({inv.document_date})
            </option>
          ))}
        </Select>
      </div>

      {/* Tab body */}
      {data.paymentMethod === 'מזומן' && (
        <CashPanel data={data} onChange={onChange} />
      )}
      {data.paymentMethod === "צ'ק" && (
        <CheckPanel data={data} onChange={onChange} />
      )}
      {data.paymentMethod === 'אשראי' && (
        <CreditPanel data={data} onChange={onChange} />
      )}
      {data.paymentMethod === 'העברה בנקאית' && (
        <BankPanel data={data} onChange={onChange} />
      )}
    </div>
  );
}

function CashPanel({ data, onChange }: ReceiptDetailsStepProps) {
  return (
    <div className={styles.detailsSection}>
      <p className={styles.sectionHeading}>מזומן</p>
      <div className={styles.formRow}>
        <label htmlFor="cash-amount" className={styles.sectionHeading}>
          סכום
        </label>
        <div className={styles.amountInputWrap}>
          <span className={styles.amountSymbol} aria-hidden="true">₪</span>
          <input
            id="cash-amount"
            type="number"
            min={0}
            className={styles.formInput}
            value={data.cashAmount}
            aria-label="סכום במזומן בשקלים"
            onChange={(e) => onChange({ ...data, cashAmount: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className={styles.formRow}>
        <label htmlFor="cash-notes" className={styles.sectionHeading}>
          הערות
        </label>
        <textarea
          id="cash-notes"
          className={styles.formTextarea}
          placeholder="הערות..."
          value={data.cashNotes}
          onChange={(e) => onChange({ ...data, cashNotes: e.target.value })}
        />
      </div>
    </div>
  );
}

function CheckPanel({ data, onChange }: ReceiptDetailsStepProps) {
  const confirmedChecks = data.checks.filter((c) => c.confirmed);
  const confirmedTotal = confirmedChecks.reduce((sum, c) => sum + c.amount, 0);

  function updateCheck(id: string, field: keyof CheckRow, value: string | number | boolean) {
    onChange({
      ...data,
      checks: data.checks.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    });
  }

  function confirmCheck(id: string) {
    updateCheck(id, 'confirmed', true);
  }

  function deleteCheck(id: string) {
    const remaining = data.checks.filter((c) => c.id !== id);
    const today = new Date().toISOString().split('T')[0];
    const next =
      remaining.length > 0
        ? remaining
        : [
            {
              id: String(Date.now()),
              date: today,
              bank: '',
              branch: '',
              accountNumber: '',
              checkNumber: '',
              amount: 0,
              confirmed: false,
            },
          ];
    onChange({ ...data, checks: next });
  }

  return (
    <div className={styles.detailsSection}>
      <p className={styles.sectionHeading}>צ&apos;קים</p>
      <div className={styles.lineItemsTableWrap}>
        <div
          className={styles.checkTable}
          role="table"
          aria-label="צ'קים"
        >
          <div className={styles.checkHeaderRow} role="row">
            <div className={styles.checkHeaderCell} role="columnheader" />
            <div className={styles.checkHeaderCell} role="columnheader">תאריך</div>
            <div className={styles.checkHeaderCell} role="columnheader">בנק</div>
            <div className={styles.checkHeaderCell} role="columnheader">סניף</div>
            <div className={styles.checkHeaderCell} role="columnheader">מס&apos; חשבון</div>
            <div className={styles.checkHeaderCell} role="columnheader">מס&apos; צ&apos;ק</div>
            <div className={styles.checkHeaderCell} role="columnheader">סכום (₪)</div>
          </div>
          {data.checks.map((check) => (
            <div key={check.id} className={styles.checkRow} role="row">
              <div className={styles.checkActionCell} role="cell">
                <button
                  type="button"
                  className={styles.checkConfirmBtn}
                  onClick={() => confirmCheck(check.id)}
                  disabled={check.confirmed}
                  aria-label="אשר צ'ק"
                >
                  <Check size={13} />
                </button>
                <button
                  type="button"
                  className={styles.checkDeleteBtn}
                  onClick={() => deleteCheck(check.id)}
                  aria-label="מחק צ'ק"
                >
                  <X size={13} />
                </button>
              </div>
              <div role="cell">
                <input
                  type="date"
                  className={check.confirmed ? styles.readOnlyInput : styles.lineItemInput}
                  value={check.date}
                  readOnly={check.confirmed}
                  onChange={(e) => updateCheck(check.id, 'date', e.target.value)}
                />
              </div>
              <div role="cell">
                <input
                  type="text"
                  className={check.confirmed ? styles.readOnlyInput : styles.lineItemInput}
                  value={check.bank}
                  placeholder="בנק"
                  readOnly={check.confirmed}
                  onChange={(e) => updateCheck(check.id, 'bank', e.target.value)}
                />
              </div>
              <div role="cell">
                <input
                  type="text"
                  className={check.confirmed ? styles.readOnlyInput : styles.lineItemInput}
                  value={check.branch}
                  placeholder="סניף"
                  readOnly={check.confirmed}
                  onChange={(e) => updateCheck(check.id, 'branch', e.target.value)}
                />
              </div>
              <div role="cell">
                <input
                  type="text"
                  className={check.confirmed ? styles.readOnlyInput : styles.lineItemInput}
                  value={check.accountNumber}
                  placeholder="חשבון"
                  readOnly={check.confirmed}
                  onChange={(e) => updateCheck(check.id, 'accountNumber', e.target.value)}
                />
              </div>
              <div role="cell">
                <input
                  type="text"
                  className={check.confirmed ? styles.readOnlyInput : styles.lineItemInput}
                  value={check.checkNumber}
                  placeholder="מס' צ'ק"
                  readOnly={check.confirmed}
                  onChange={(e) => updateCheck(check.id, 'checkNumber', e.target.value)}
                />
              </div>
              <div role="cell">
                <input
                  type="number"
                  className={check.confirmed ? styles.readOnlyInput : styles.lineItemInput}
                  value={check.amount}
                  min={0}
                  readOnly={check.confirmed}
                  onChange={(e) => updateCheck(check.id, 'amount', Number(e.target.value))}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* הוסף צ'ק */}
      <button
        type="button"
        className={styles.addCheckBtn}
        onClick={() => {
          const today = new Date().toISOString().split('T')[0];
          onChange({
            ...data,
            checks: [
              ...data.checks,
              { id: String(Date.now()), date: today, bank: '', branch: '', accountNumber: '', checkNumber: '', amount: 0, confirmed: false },
            ],
          });
        }}
      >
        + הוסף צ&apos;ק
      </button>

      {/* ניכוי במקור */}
      <div className={styles.witholdingRow}>
        <span className={styles.witholdingLabel}>ניכוי במקור</span>
        <div className={styles.witholdingInputWrap}>
          <input
            type="number"
            min={0}
            className={styles.formInput}
            value={data.withholding}
            aria-label="ניכוי במקור בשקלים"
            onChange={(e) => onChange({ ...data, withholding: Number(e.target.value) })}
          />
          <span className={styles.witholdingSymbol} aria-hidden="true">₪</span>
        </div>
      </div>

      {/* Summary bar */}
      <div className={styles.checkSummaryBar}>
        <span className={styles.checkSummaryLabel}>
          סה&quot;כ צ&apos;קים ({confirmedChecks.length})
        </span>
        <span className={styles.checkSummaryAmount}>₪{confirmedTotal.toFixed(2)}</span>
      </div>

      {/* Info note */}
      <p className={styles.checkInfoNote}>
        כל צ&apos;ק ייצור טיוט חשבונית מס — הטיוטה תהפוך אוטומטית לחשבונית מס בתאריך הפירעון
      </p>

      <div className={styles.formRow}>
        <label htmlFor="check-notes" className={styles.sectionHeading}>
          הערות
        </label>
        <textarea
          id="check-notes"
          className={styles.formTextarea}
          placeholder="הערות..."
          value={data.checkNotes}
          onChange={(e) => onChange({ ...data, checkNotes: e.target.value })}
        />
      </div>
    </div>
  );
}

function CreditPanel({ data, onChange }: ReceiptDetailsStepProps) {
  return (
    <div className={styles.detailsSection}>
      <p className={styles.sectionHeading}>אשראי</p>
      <div className={styles.receiptTwoCol}>
        <div className={styles.formRow}>
          <label htmlFor="card-last-four" className={styles.sectionHeading}>
            4 ספרות אחרונות
          </label>
          <input
            id="card-last-four"
            type="text"
            placeholder="1234"
            maxLength={4}
            className={styles.formInput}
            value={data.cardLastFour}
            onChange={(e) => onChange({ ...data, cardLastFour: e.target.value })}
          />
        </div>
        <div className={styles.formRow}>
          <label htmlFor="card-expiry" className={styles.sectionHeading}>
            תוקף
          </label>
          <input
            id="card-expiry"
            type="text"
            placeholder="MM/YY"
            className={styles.formInput}
            value={data.cardExpiry}
            onChange={(e) => onChange({ ...data, cardExpiry: e.target.value })}
          />
        </div>
      </div>
      <div className={styles.receiptTwoCol}>
        <div className={styles.formRow}>
          <label htmlFor="card-amount" className={styles.sectionHeading}>
            סכום
          </label>
          <div className={styles.amountInputWrap}>
            <span className={styles.amountSymbol} aria-hidden="true">₪</span>
            <input
              id="card-amount"
              type="number"
              min={0}
              className={styles.formInput}
              value={data.cardAmount}
              aria-label="סכום אשראי בשקלים"
              onChange={(e) => onChange({ ...data, cardAmount: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className={styles.formRow}>
          <label htmlFor="card-installments" className={styles.sectionHeading}>
            מספר תשלומים
          </label>
          <input
            id="card-installments"
            type="number"
            min={1}
            className={styles.formInput}
            value={data.cardInstallments}
            onChange={(e) =>
              onChange({ ...data, cardInstallments: Math.max(1, Number(e.target.value)) })
            }
          />
        </div>
      </div>
      <div className={styles.formRow}>
        <label htmlFor="card-notes" className={styles.sectionHeading}>
          הערות
        </label>
        <textarea
          id="card-notes"
          className={styles.formTextarea}
          placeholder="הערות..."
          value={data.cardNotes}
          onChange={(e) => onChange({ ...data, cardNotes: e.target.value })}
        />
      </div>
    </div>
  );
}

function BankPanel({ data, onChange }: ReceiptDetailsStepProps) {
  return (
    <div className={styles.detailsSection}>
      <p className={styles.sectionHeading}>העברה בנקאית</p>
      <div className={styles.receiptThreeCol}>
        <div className={styles.formRow}>
          <label htmlFor="bank-date" className={styles.sectionHeading}>
            תאריך
          </label>
          <input
            id="bank-date"
            type="date"
            className={styles.formInput}
            value={data.bankDate}
            onChange={(e) => onChange({ ...data, bankDate: e.target.value })}
          />
        </div>
        <div className={styles.formRow}>
          <label htmlFor="bank-reference" className={styles.sectionHeading}>
            אסמכתא
          </label>
          <input
            id="bank-reference"
            type="text"
            placeholder="מס' אסמכתא"
            className={styles.formInput}
            value={data.bankReference}
            onChange={(e) => onChange({ ...data, bankReference: e.target.value })}
          />
        </div>
        <div className={styles.formRow}>
          <label htmlFor="bank-amount" className={styles.sectionHeading}>
            סכום
          </label>
          <div className={styles.amountInputWrap}>
            <span className={styles.amountSymbol} aria-hidden="true">₪</span>
            <input
              id="bank-amount"
              type="number"
              min={0}
              className={styles.formInput}
              value={data.bankAmount}
              aria-label="סכום העברה בנקאית בשקלים"
              onChange={(e) => onChange({ ...data, bankAmount: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>
      <div className={styles.formRow}>
        <label htmlFor="bank-notes" className={styles.sectionHeading}>
          הערות
        </label>
        <textarea
          id="bank-notes"
          className={styles.formTextarea}
          placeholder="הערות..."
          value={data.bankNotes}
          onChange={(e) => onChange({ ...data, bankNotes: e.target.value })}
        />
      </div>
    </div>
  );
}

/* ─── SummaryStep ─────────────────────────────────────────────────── */

interface SummaryStepProps {
  clientType: ClientType | null;
  docType: string | null;
  customer: ChildWithDetails | null;
  businessFormData: BusinessCustomerFormData;
  businessCustomerId: string | null;
  invoiceDetails: InvoiceDetailsData;
}

function SummaryStep({
  clientType,
  docType,
  customer,
  businessFormData,
  businessCustomerId: _businessCustomerId,
  invoiceDetails,
}: SummaryStepProps) {
  const customerName =
    clientType === 'business'
      ? `${businessFormData.first_name} ${businessFormData.last_name}`.trim() || '—'
      : clientType === 'existing' && customer
      ? getCustomerLabel(customer)
      : '—';

  const isInvoice = docType === 'חשבונית מס';

  const subtotal = invoiceDetails.lineItems.reduce(
    (s, i) => s + i.quantity * i.price,
    0
  );
  const vatAmount = invoiceDetails.vatExempt
    ? 0
    : (subtotal - invoiceDetails.discountAmount) * 0.18;
  const totalBeforeRounding = subtotal - invoiceDetails.discountAmount + vatAmount;
  const finalTotal = invoiceDetails.roundTotal
    ? Math.round(totalBeforeRounding)
    : totalBeforeRounding;

  return (
    <div className={styles.summaryCards}>
      {/* Card 1 — פרטי מנפיק */}
      <div className={`${styles.summaryCard} ${styles.summaryCardMuted}`}>
        <p className={styles.summaryCardTitle}>פרטי מנפיק</p>
        <p className={styles.issuerLine}>קוגומלו גרופ בע&quot;מ | ח.פ 516504412</p>
        <p className={styles.issuerLine}>רפאל איתן 5, פתח תקווה | חברה בע&quot;מ</p>
      </div>

      {/* Card 2 — סיכום מסמך */}
      <div className={`${styles.summaryCard} ${styles.summaryCardWhite}`}>
        <p className={styles.summaryCardTitle}>סיכום מסמך</p>
        <dl className={styles.summaryCardBody}>
          <div className={styles.summaryDetailRow}>
            <dt className={styles.summaryRowLabel}>סוג מסמך:</dt>
            <dd className={styles.summaryRowValue}>{docType ?? '—'}</dd>
          </div>
          <div className={styles.summaryDetailRow}>
            <dt className={styles.summaryRowLabel}>לקוח:</dt>
            <dd className={styles.summaryRowValue}>{customerName}</dd>
          </div>
          {isInvoice && (
            <div className={styles.summaryDetailRow}>
              <dt className={styles.summaryRowLabel}>מספר מסמך:</dt>
              <dd className={styles.summaryRowValue}>{invoiceDetails.documentNumber}</dd>
            </div>
          )}
          {isInvoice && (
            <>
              <div className={styles.summaryDetailRow}>
                <dt className={styles.summaryRowLabel}>סה&quot;כ לפני מע&quot;מ:</dt>
                <dd className={styles.summaryRowValue}>₪{subtotal.toFixed(2)}</dd>
              </div>
              <div className={styles.summaryDetailRow}>
                <dt className={styles.summaryRowLabel}>מע&quot;מ:</dt>
                <dd className={styles.summaryRowValue}>₪{vatAmount.toFixed(2)}</dd>
              </div>
              <div className={styles.summaryTotalRow}>
                <dt className={styles.summaryTotalLabel}>סה&quot;כ:</dt>
                <dd className={styles.summaryTotalValue}>
                  ₪{finalTotal.toFixed(2)}
                </dd>
              </div>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
