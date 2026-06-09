'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  FileEdit,
  FileText,
  Loader2,
  Receipt,
  Search,
  User,
  X,
} from 'lucide-react';
import api, { createBusinessCustomer, searchBusinessCustomers } from '@/lib/api';
import { Select } from '@/components/ui/select';
import type { ChildWithDetails } from '@/types/customer';
import styles from './index.module.css';
import { BUSINESS_TYPE_OPTIONS, CLIENT_TYPE_OPTIONS, DOCUMENT_TYPE_OPTIONS } from './constants';
import { canAdvanceFromStep, getNextButtonLabel, getStepStatus } from './utils';
import { useNewDocumentWizard } from './useNewDocumentWizard';
import type {
  BusinessCustomer,
  BusinessCustomerFormData,
  ClientType,
  InvoiceDetailsData,
  LineItem,
  NewDocumentDialogProps,
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
    businessCustomerId,
    businessFormData,
    docType,
    invoiceDetails,
    setClientType,
    setSelectedCustomerId,
    setBusinessCustomerId,
    setBusinessFormData,
    setDocType,
    setInvoiceDetails,
    goToStep,
    goNext,
    goBack,
    close,
  } = wizard;

  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const canAdvance = canAdvanceFromStep(
    currentStep,
    clientType,
    selectedCustomerId,
    businessCustomerId,
    businessFormData,
    docType,
    invoiceDetails
  );
  const isFirstStep = steps[0]?.id === currentStep;
  const isLastStep = steps[steps.length - 1]?.id === currentStep;

  async function handleNext() {
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
    goNext(canAdvance);
  }

  return (
    <div
      className={styles.overlay}
      dir="rtl"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
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
              מסמך חדש
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
                  id_number: customer.id_number,
                  company_number: customer.company_number,
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
            <DocTypeStep docType={docType} onSelect={setDocType} />
          )}
          {currentStep === 'documentDetails' && docType === 'חשבונית מס' && (
            <InvoiceDetailsStep data={invoiceDetails} onChange={setInvoiceDetails} />
          )}
          {currentStep === 'documentDetails' && docType !== 'חשבונית מס' && (
            <DocumentDetailsStep />
          )}
          {currentStep === 'summary' && (
            <SummaryStep
              clientType={clientType}
              docType={docType}
              customer={selectedCustomer}
              businessFormData={businessFormData}
              businessCustomerId={businessCustomerId}
            />
          )}
        </div>

        <div className={styles.footer}>
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
    </div>
  );
}

/* ─── Step sub-components ─────────────────────────────────────────── */

interface SelectableCardProps {
  icon: IconComponent;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}

function SelectableCard({
  icon: Icon,
  title,
  description,
  selected,
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
        className={`${styles.cardIconWrap} ${selected ? styles.cardIconWrapSelected : ''}`}
      >
        <Icon
          size={24}
          className={selected ? styles.cardIconSelected : styles.cardIcon}
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
            ת.ז
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
          <label htmlFor="biz-company-number" className={styles.fieldLabel}>
            ח.פ
          </label>
          <input
            id="biz-company-number"
            type="text"
            className={styles.formInput}
            value={formData.company_number}
            onChange={(e) => updateField('company_number', e.target.value)}
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
  return (
    <div>
      <p className={styles.stepSubtitle}>בחר לקוח קיים מתוך הרשימה</p>
      <div className={styles.fieldGroup}>
        <label htmlFor="existing-customer" className={styles.fieldLabel}>
          לקוח קיים
        </label>
        <Select
          id="existing-customer"
          className={styles.fieldSelect}
          value={selectedCustomerId ?? ''}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="" disabled>
            בחר לקוח קיים
          </option>
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

/* ─── DocTypeStep ─────────────────────────────────────────────────── */

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

/* ─── DocumentDetailsStep ─────────────────────────────────────────── */

function DocumentDetailsStep() {
  return (
    <div>
      <p className={styles.stepSubtitle}>הזן את פרטי המסמך</p>
      <div className={styles.placeholderBox}>
        <FileText size={28} className={styles.placeholderIcon} />
        <p className={styles.placeholderText}>
          טופס פרטי המסמך יתווסף כאן בהמשך הפיתוח
        </p>
      </div>
    </div>
  );
}

/* ─── InvoiceDetailsStep ──────────────────────────────────────────── */

interface InvoiceDetailsStepProps {
  data: InvoiceDetailsData;
  onChange: (data: InvoiceDetailsData) => void;
}

function InvoiceDetailsStep({ data, onChange }: InvoiceDetailsStepProps) {
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
              onChange={(e) => onChange({ ...data, discountAmount: Number(e.target.value) })}
              aria-label="סכום הנחה בשקלים"
            />
            <span className={styles.discountLabel}>₪</span>
            <input
              type="number"
              className={styles.discountInput}
              value={data.discountPercent}
              min={0}
              max={100}
              onChange={(e) => onChange({ ...data, discountPercent: Number(e.target.value) })}
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
}

function SummaryStep({
  clientType,
  docType,
  customer,
  businessFormData,
  businessCustomerId,
}: SummaryStepProps) {
  const clientLabel =
    CLIENT_TYPE_OPTIONS.find((option) => option.type === clientType)?.title ?? '—';

  const businessCustomerName =
    businessCustomerId !== null
      ? `${businessFormData.first_name} ${businessFormData.last_name}`.trim() || '—'
      : null;

  return (
    <div>
      <p className={styles.stepSubtitle}>סקור את פרטי המסמך לפני ההפקה</p>
      <dl className={styles.summaryList}>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryLabel}>סוג לקוח</dt>
          <dd className={styles.summaryValue}>{clientLabel}</dd>
        </div>
        {clientType === 'business' && businessCustomerName && (
          <div className={styles.summaryRow}>
            <dt className={styles.summaryLabel}>לקוח עסקי</dt>
            <dd className={styles.summaryValue}>{businessCustomerName}</dd>
          </div>
        )}
        {clientType === 'existing' && (
          <div className={styles.summaryRow}>
            <dt className={styles.summaryLabel}>לקוח</dt>
            <dd className={styles.summaryValue}>
              {customer ? getCustomerLabel(customer) : '—'}
            </dd>
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
