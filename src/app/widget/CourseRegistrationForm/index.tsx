'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import styles from './index.module.css';
import look from './newLook.module.css';
import { israeliIdFieldError, sanitizeIsraeliIdInput } from '@/lib/israeliId';
import { readToEndState } from '@/lib/readToEnd';
import { enrollmentSelectionKey, type EnrollmentSelection } from '../catalogRows';
import AdditionalChildSection, {
  childLessonSelections,
  createEmptyAdditionalChild,
  MAX_EXTRA_LESSONS,
  type AdditionalChildEnrollment,
  type AdditionalChildFieldKey,
} from './AdditionalChildSection';
import ExtraLessonPicker from './ExtraLessonPicker';
import SelectedLessonCard from './SelectedLessonCard';
import ProcessingPanel from './ProcessingPanel';
import StepBar from './StepBar';
import ConsentSteps from './ConsentSteps';
import PaymentSummary from './PaymentSummary';
import SuccessSummary from './SuccessSummary';
import { formatShekelShort } from './paymentSummaryModel';
import { registerDeadlineMs, useWaitDeadline, WAIT_SLACK_MS } from './waitDeadline';
import type { ProcessingPhase } from './processingCopy';
import { SkeletonLessonOptions, SkeletonTextLines } from '../WidgetSkeletons/WidgetSkeletons';
import { trialNextStep } from './trialFlow';
import {
  CHECKOUT_POLL_MS,
  HOSTED_CHARGE_DEADLINE_MS,
  cardAccepted,
  checkoutOutcome,
  checkoutSettlement,
  readCheckoutStart,
  readFrameMessage,
} from '@/lib/courseCheckout';
import type { AppliedDiscount, Props, Step, LookupResult, PaymentResponse, TrialOccurrence } from './types';

export type { CourseLesson } from './types';

const MIN_NAME_LENGTH = 2;
const REQUIRED = 'שדה חובה';
const NAME_TOO_SHORT = `יש להזין לפחות ${MIN_NAME_LENGTH} תווים`;
const MAX_ADDITIONAL_CHILDREN = 3;
const CHARGE_TIMEOUT_MS = 90_000;
const CHARGE_POLL_INTERVAL_MS = 2_000;
const CHARGE_POLL_MAX_MS = 60_000;
/** The whole charge — the request, then the settlement polling — on the wall clock. */
const CHARGE_DEADLINE_MS = CHARGE_TIMEOUT_MS + CHARGE_POLL_MAX_MS + WAIT_SLACK_MS;
/** On the "checking the payment" screen: how often, and for how long, to ask. */
const PENDING_POLL_INTERVAL_MS = 5_000;
const PENDING_POLL_MAX_MS = 120_000;

const REGISTER_OVERDUE_MESSAGE =
  'לא קיבלנו תשובה מהשרת כבר זמן רב, וההרשמה עוד לא הושלמה. בדקו את החיבור לאינטרנט ונסו שוב. '
  + 'אם זה חוזר על עצמו — התקשרו אלינו ונשלים את ההרשמה יחד.';
const CHARGE_OVERDUE_MESSAGE =
  'הכרטיס נשלח לחברת הסליקה ועדיין לא קיבלנו אישור. אל תשלמו שוב — אם החיוב עבר, ההרשמה תופיע תוך רגע.';

type DiscountQueueItem = {
  id: 'primary' | string;
  label: string;
};

type NameFieldKey = 'parentFirstName' | 'parentLastName' | 'childFirstName' | 'childLastName';
type IdFieldKey = 'parentIdNumber' | 'childIdNumber';
type DetailsFieldKey = NameFieldKey | IdFieldKey | 'parentPhone' | 'parentEmail' | 'childBirthDate' | 'childGender';
type ConsentFieldKey = 'health' | 'terms' | 'signature';

/**
 * One date in the trial picker.
 *
 * A full date stays in the list and is shown as full. Removing it was the older
 * behaviour and it misled: a parent whose nearest date was taken saw a shorter
 * list, which reads as "this class has no dates", rather than "that Wednesday is
 * taken, the one after is free".
 */
function TrialDateRow({
  occ,
  checked = false,
  onPick,
}: {
  occ: TrialOccurrence;
  checked?: boolean;
  onPick?: () => void;
}) {
  const full = Boolean(occ.is_full);
  return (
    <label
      className={[
        styles.trialDateOption,
        checked ? styles.trialDateOptionSelected : '',
        full ? styles.trialDateOptionFull : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-disabled={full || undefined}
    >
      <input
        type="radio"
        name="trialLessonDate"
        value={occ.date}
        checked={checked}
        disabled={full}
        onChange={() => {
          if (!full) onPick?.();
        }}
        className={styles.trialDateRadio}
      />
      <span className={styles.trialDateLabel}>
        {occ.day_name} · {occ.label}
      </span>
      <span className={styles.trialDateTime}>
        {full ? 'מלא' : `${occ.start_time}–${occ.end_time}`}
      </span>
    </label>
  );
}

function nameFieldError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return REQUIRED;
  return trimmed.length >= MIN_NAME_LENGTH ? null : NAME_TOO_SHORT;
}

const PHONE_DIGITS = 10;

function sanitizePhoneInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, PHONE_DIGITS);
}

function phoneFieldError(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return 'טלפון נייד חובה';
  if (digits.length !== PHONE_DIGITS) {
    return `יש להזין ${PHONE_DIGITS} ספרות (הוזנו ${digits.length})`;
  }
  if (!/^05\d{8}$/.test(digits)) {
    return 'מספר נייד חייב להתחיל ב-05';
  }
  return null;
}

function emailFieldError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'דוא"ל חובה';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'כתובת דוא"ל לא תקינה';
  }
  return null;
}

const ALREADY_REGISTERED_LESSON = 'הילד כבר רשום לחוג זה';

function lookupBlocksLesson(
  lookup: LookupResult | null | undefined,
  selections: Array<{ lessonId?: string }>,
): boolean {
  if (!lookup) return false;
  if (lookup.already_registered) return true;
  const enrolled = new Set(lookup.enrolled_lesson_ids ?? []);
  if (enrolled.size === 0) return false;
  return selections.some((selection) => Boolean(selection.lessonId && enrolled.has(selection.lessonId)));
}

export default function CourseRegistrationForm({
  courseId,
  courseName,
  isAdult = false,
  bundleId,
  lessonId,
  priceOptionId,
  trialLessonOptions = [],
  isTrial = false,
  trialLessonIsPaid = false,
  trialLessonPrice,
  catalogDefaultFilters = { city: '', branch: '', courseType: '', age: '' },
  initialParent = null,
  onBack,
  onComplete,
  onRegisterAnother,
}: Props) {
  const addingSibling = Boolean(initialParent);
  const [step, setStep] = useState<Step>('details');
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DetailsFieldKey, string>>>({});

  // Step 1 — details
  const [parentIdNumber, setParentIdNumber] = useState(initialParent?.parentIdNumber ?? '');
  const [parentFirstName, setParentFirstName] = useState(initialParent?.parentFirstName ?? '');
  const [parentLastName, setParentLastName] = useState(initialParent?.parentLastName ?? '');
  const [parentPhone, setParentPhone] = useState(initialParent?.parentPhone ?? '');
  const [parentEmail, setParentEmail] = useState(initialParent?.parentEmail ?? '');
  const [childFirstName, setChildFirstName] = useState('');
  const [childLastName, setChildLastName] = useState(initialParent?.parentLastName ?? '');
  const [childIdNumber, setChildIdNumber] = useState('');
  const [childBirthDate, setChildBirthDate] = useState('');
  const [childGender, setChildGender] = useState<'male' | 'female' | ''>('');
  const [selfRegistering, setSelfRegistering] = useState(false);

  // Lookup result — used for discount step
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [additionalChildren, setAdditionalChildren] = useState<AdditionalChildEnrollment[]>([]);
  const [primaryExtraLessons, setPrimaryExtraLessons] = useState<EnrollmentSelection[]>([]);
  const [primaryExtraPickerOpen, setPrimaryExtraPickerOpen] = useState(false);
  const [replacingPrimaryExtraIndex, setReplacingPrimaryExtraIndex] = useState<number | null>(null);
  const [discountQueue, setDiscountQueue] = useState<DiscountQueueItem[]>([]);
  const [discountQueueIndex, setDiscountQueueIndex] = useState(0);
  const [registeredChildCount, setRegisteredChildCount] = useState(1);
  const [registeredLessonCount, setRegisteredLessonCount] = useState(1);

  // Step 3 — consents
  const [healthConsent, setHealthConsent] = useState(false);
  // The terms carry the consent to computerized documents (סעיף 18ב(ג)), so
  // accepting them is that consent — the server records it on the family.
  const [termsConsent, setTermsConsent] = useState(false);
  const [termsReadComplete, setTermsReadComplete] = useState(false);
  const [termsOpenedOnce, setTermsOpenedOnce] = useState(false);
  const [termsScrolledToEnd, setTermsScrolledToEnd] = useState(false);
  const [termsCanJumpToEnd, setTermsCanJumpToEnd] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [consentErrors, setConsentErrors] = useState<Partial<Record<ConsentFieldKey, string>>>({});
  const termsBodyRef = useRef<HTMLDivElement | null>(null);
  const termsResizeRef = useRef<ResizeObserver | null>(null);

  // Payment step
  const [paymentData, setPaymentData] = useState<PaymentResponse | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardHolderId, setCardHolderId] = useState('');
  const [charging, setCharging] = useState(false);
  // 'charge' while the card round trip is open; 'verify' once the gateway
  // accepted the card and we are polling for the settled status.
  const [chargePhase, setChargePhase] = useState<ProcessingPhase>('charge');
  // Each submit is an attempt. An answer that arrives after a newer attempt has
  // started belongs to nobody and is dropped; one that arrives after the wait
  // gave up, with no newer attempt, is still news and is shown.
  const attemptRef = useRef(0);
  const [registerProgress, setRegisterProgress] = useState<{ done: number; total: number } | null>(null);
  const [registerDeadline, setRegisterDeadline] = useState(registerDeadlineMs(1));
  // The screen a registration was sent from, which is where a wait that gave up
  // puts the parent back — with the message, and with everything they typed.
  const submittedFromRef = useRef<'error' | 'trial_confirm'>('error');
  // The "checking the payment" screen asks by itself, and stops asking in time.
  const [pendingChecking, setPendingChecking] = useState(false);
  const pendingRoundRef = useRef(0);
  // Tranzila's page for the course (COURSE_HOSTED_PAGE_ENABLED on the server):
  // 'unknown' until the server is asked; 'card' when it says to keep the card
  // form below, exactly as before.
  const [hostedMode, setHostedMode] = useState<'unknown' | 'asking' | 'hosted' | 'card' | 'error'>('unknown');
  const [hostedCheckout, setHostedCheckout] = useState<{ id: string; url: string } | null>(null);
  // One answer per page: a late poll must not move a screen already moved on.
  const hostedDoneRef = useRef(false);
  // The card passed Tranzila's check and the server is charging it: the
  // working panel replaces the frame until the answer comes.
  const [hostedProcessing, setHostedProcessing] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  // The payment summary plays its discounts in once per basket; a second look
  // (after a declined card) shows the figures at rest.
  const summaryPlayedRef = useRef<string | null>(null);
  const payActionRef = useRef<HTMLDivElement | null>(null);
  const consentSubmitRef = useRef<HTMLButtonElement | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const [termsContent, setTermsContent] = useState('');
  const [loadingTerms, setLoadingTerms] = useState(false);

  const [trialOccurrences, setTrialOccurrences] = useState<TrialOccurrence[]>([]);
  const [trialLessonDate, setTrialLessonDate] = useState('');
  const [selectedTrialLessonId, setSelectedTrialLessonId] = useState(lessonId ?? '');
  const [loadingTrialDates, setLoadingTrialDates] = useState(false);

  const effectiveTrialLessonId = lessonId || selectedTrialLessonId;
  const trialLessonIdsKey = lessonId ?? trialLessonOptions.map((option) => option.id).join(',');
  const trialLessonIds = lessonId
    ? [lessonId]
    : trialLessonOptions.map((option) => option.id);

  const primarySelectionKey = enrollmentSelectionKey({
    courseId,
    bundleId,
    lessonId,
    priceOptionId,
  });

  const canAddAnotherChild = !isTrial && !selfRegistering;
  const canAddExtraLesson = !isTrial;
  const primarySelection: EnrollmentSelection = {
    courseId,
    courseName,
    bundleId,
    lessonId,
    priceOptionId,
    displayTitle: courseName,
    displaySchedule: '',
    displayPrice: null,
  };
  const primaryExcludedSelectionKeys = (() => {
    const keys = new Set<string>([primarySelectionKey]);
    primaryExtraLessons.forEach((selection, extraIndex) => {
      if (replacingPrimaryExtraIndex === extraIndex) return;
      keys.add(enrollmentSelectionKey(selection));
    });
    return keys;
  })();

  useEffect(() => {
    setSelectedTrialLessonId(lessonId ?? '');
  }, [lessonId]);

  useEffect(() => {
    if (!isTrial || trialLessonIds.length === 0) {
      setTrialOccurrences([]);
      setTrialLessonDate('');
      setSelectedTrialLessonId(lessonId ?? '');
      return;
    }

    setLoadingTrialDates(true);
    setTrialLessonDate('');
    setSelectedTrialLessonId(lessonId ?? '');

    const params =
      trialLessonIds.length === 1
        ? { lesson_id: trialLessonIds[0], count: 3 }
        : { lesson_ids: trialLessonIds.join(','), count: 3 };

    api.get('/customers/widget/lesson-occurrences/', { params })
      .then((res) => {
        const dates = Array.isArray(res.data) ? res.data as TrialOccurrence[] : [];
        setTrialOccurrences(dates);
        if (dates.length === 1) {
          setTrialLessonDate(dates[0].date);
          if (dates[0].lesson_id) setSelectedTrialLessonId(dates[0].lesson_id);
        }
      })
      .catch(() => setTrialOccurrences([]))
      .finally(() => setLoadingTrialDates(false));
  }, [isTrial, lessonId, trialLessonIdsKey, trialLessonOptions]);

  useEffect(() => {
    setLoadingTerms(true);
    api.get('/customers/widget/terms/')
      .then((res) => setTermsContent(res.data?.content || ''))
      .catch(() => setTermsContent(''))
      .finally(() => setLoadingTerms(false));
  }, []);

  const updateTermsScrollState = useCallback(() => {
    const el = termsBodyRef.current;
    if (!el) return;
    // The rule is shared with the tenant's contract page (readToEnd.ts), so both read "the end" alike.
    const { scrollable, atEnd: atBottom } = readToEndState(el);
    if (atBottom) setTermsScrolledToEnd(true);
    setTermsCanJumpToEnd(scrollable && !atBottom);
  }, []);

  /**
   * Measured through a callback ref so the document is sized the moment it
   * mounts, and watched afterwards because its real height only lands once the
   * fonts and markup have settled.
   */
  const attachTermsBody = useCallback((el: HTMLDivElement | null) => {
    termsResizeRef.current?.disconnect();
    termsResizeRef.current = null;
    termsBodyRef.current = el;
    if (!el) return;
    updateTermsScrollState();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateTermsScrollState());
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    termsResizeRef.current = observer;
  }, [updateTermsScrollState]);

  useEffect(() => {
    if (!showTerms || loadingTerms) return;
    const el = termsBodyRef.current;
    if (!el) return;
    updateTermsScrollState();
    if (el.scrollHeight <= el.clientHeight + 1) {
      setTermsScrolledToEnd(true);
    } else if (!termsReadComplete) {
      setTermsScrolledToEnd(false);
    }
  }, [showTerms, loadingTerms, termsContent, termsReadComplete, updateTermsScrollState]);

  const openTermsModal = () => {
    setShowTerms(true);
    setTermsOpenedOnce(true);
    if (!termsReadComplete) {
      setTermsScrolledToEnd(false);
    }
  };

  /** Long documents on a phone are a lot of thumb work — offer the shortcut. */
  const jumpToTermsEnd = () => {
    const el = termsBodyRef.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  };

  const confirmTermsRead = () => {
    if (!termsScrolledToEnd) return;
    setTermsReadComplete(true);
    setTermsConsent(true);
    setShowTerms(false);
    setConsentErrors((prev) => {
      if (!prev.terms) return prev;
      const next = { ...prev };
      delete next.terms;
      return next;
    });
  };

  const clearConsentError = (field: ConsentFieldKey) => {
    setConsentErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validateAdditionalChildFields = (
    child: AdditionalChildEnrollment,
    usedIdNumbers: Set<string>,
  ): Partial<Record<AdditionalChildFieldKey, string>> => {
    const errors: Partial<Record<AdditionalChildFieldKey, string>> = {};
    if (!child.selection) errors.selection = 'יש לבחור חוג ומפגש';
    const firstErr = nameFieldError(child.firstName);
    const lastErr = nameFieldError(child.lastName);
    if (firstErr) errors.firstName = firstErr;
    if (lastErr) errors.lastName = lastErr;
    const idErr = israeliIdFieldError(child.idNumber);
    if (idErr) errors.idNumber = idErr;
    else if (usedIdNumbers.has(child.idNumber.replace(/\D/g, ''))) {
      errors.idNumber = 'ת.ז. כבר בשימוש לילד אחר בטופס';
    }
    if (!child.birthDate.trim()) errors.birthDate = 'תאריך לידה חובה';
    if (!child.gender) errors.gender = 'יש לבחור מין';
    return errors;
  };

  const mergePaymentResponses = (responses: PaymentResponse[]): PaymentResponse => {
    const paymentIds = responses.flatMap((response) => response.payment_ids ?? [response.payment_id]);
    const discountsApplied = responses.flatMap((response) => response.discounts_applied ?? []);
    return {
      payment_id: paymentIds[0],
      payment_ids: paymentIds.length > 1 ? paymentIds : undefined,
      final_amount: responses.reduce((sum, response) => sum + Number(response.final_amount), 0),
      base_amount: responses.reduce((sum, response) => sum + Number(response.base_amount), 0),
      discount_amount: responses.reduce((sum, response) => sum + Number(response.discount_amount), 0),
      prorated_amount: responses.reduce((sum, response) => sum + Number(response.prorated_amount ?? 0), 0),
      registration_fee: responses.reduce((sum, response) => sum + Number(response.registration_fee ?? 0), 0),
      monthly_amount: responses.reduce((sum, response) => sum + Number(response.monthly_amount ?? 0), 0),
      // Two lessons on different weekdays have different counts, and summing
      // them would say something untrue. Explained only when there is one.
      prorate_lessons_remaining:
        responses.length === 1 ? responses[0].prorate_lessons_remaining : undefined,
      total_lessons_this_month:
        responses.length === 1 ? responses[0].total_lessons_this_month : undefined,
      subscription_start_date: responses.find((response) => response.subscription_start_date)?.subscription_start_date,
      // Shown only when every registration in the basket starts on the same day.
      next_billing_date: responses.every((response) => response.next_billing_date === responses[0].next_billing_date)
        ? responses[0].next_billing_date
        : undefined,
      // Only one registration in a basket can hold the credit — the others see it
      // already taken — so summing gives the single amount that was applied.
      trial_credit_amount: responses.reduce((sum, response) => sum + Number(response.trial_credit_amount ?? 0), 0),
      trial_credit_paid: responses.find((response) => Number(response.trial_credit_amount ?? 0) > 0)?.trial_credit_paid,
      trial_credit_date: responses.find((response) => Number(response.trial_credit_amount ?? 0) > 0)?.trial_credit_date,
      trial_credit_reason: responses.find((response) => Number(response.trial_credit_amount ?? 0) > 0)?.trial_credit_reason,
      discounts_applied: discountsApplied,
    };
  };

  const registerEnrollment = async (payload: Record<string, unknown>): Promise<PaymentResponse> => {
    const res = await api.post('/customers/widget/register/', payload);
    if (res.data.is_bundle) {
      return {
        child_id: res.data.child_id,
        payment_id: res.data.payments[0].payment_id,
        payment_ids: res.data.payments.map((payment: { payment_id: string }) => payment.payment_id),
        final_amount: res.data.final_amount,
        base_amount: res.data.base_amount,
        discount_amount: res.data.discount_amount,
        prorated_amount: res.data.prorated_amount,
        registration_fee: res.data.registration_fee,
        monthly_amount: res.data.monthly_amount,
        prorate_lessons_remaining: res.data.prorate_lessons_remaining,
        total_lessons_this_month: res.data.total_lessons_this_month,
        subscription_start_date: res.data.subscription_start_date,
        next_billing_date: res.data.next_billing_date,
        trial_credit_amount: res.data.trial_credit_amount,
        trial_credit_paid: res.data.trial_credit_paid,
        trial_credit_date: res.data.trial_credit_date,
        trial_credit_reason: res.data.trial_credit_reason,
        discounts_applied: res.data.payments.flatMap(
          (payment: { discounts_applied?: AppliedDiscount[] }) => payment.discounts_applied ?? [],
        ),
      };
    }
    return res.data as PaymentResponse;
  };

  const buildDiscountQueue = (
    primaryLookup: LookupResult | null,
    extraChildren: AdditionalChildEnrollment[],
    primaryLabel: string,
  ): DiscountQueueItem[] => {
    const queue: DiscountQueueItem[] = [];
    if (primaryLookup?.discount_type) {
      queue.push({ id: 'primary', label: primaryLabel });
    }
    for (const child of extraChildren) {
      if (child.lookup?.discount_type) {
        queue.push({ id: child.id, label: child.firstName.trim() || `ילד ${extraChildren.indexOf(child) + 2}` });
      }
    }
    return queue;
  };

  const applyDiscountAnswer = (targetId: 'primary' | string, confirmed: boolean) => {
    if (targetId === 'primary') {
      setLookup((prev) => (prev ? { ...prev, _confirmed: confirmed } as LookupResult & { _confirmed: boolean } : prev));
      return;
    }
    setAdditionalChildren((prev) =>
      prev.map((child) =>
        child.id === targetId
          ? {
              ...child,
              lookup: child.lookup
                ? ({ ...child.lookup, _confirmed: confirmed } as LookupResult & { _confirmed: boolean })
                : child.lookup,
            }
          : child,
      ),
    );
  };

  const getLookupForDiscountTarget = (targetId: 'primary' | string): LookupResult | null => {
    if (targetId === 'primary') return lookup;
    return additionalChildren.find((child) => child.id === targetId)?.lookup ?? null;
  };

  /** One question to the server about this basket's payments. */
  const checkChargeOnce = async (): Promise<'completed' | 'failed' | 'processing'> => {
    if (hostedCheckout) {
      // Asking the checkout also lets the server finish one whose verdict is
      // still missing; the payments alone would only say "pending".
      const res = await api.get(`/customers/widget/checkout/${hostedCheckout.id}/`, { timeout: 15_000 });
      return checkoutSettlement(res.data?.status);
    }
    if (!paymentData) return 'failed';
    const ids = paymentData.payment_ids?.length ? paymentData.payment_ids : [paymentData.payment_id];
    const res = await api.get('/customers/widget/payment-status/', {
      params: { payment_ids: ids.join(',') },
      timeout: 15_000,
    });
    if (res.data?.success) return 'completed';
    if (res.data?.processing) return 'processing';
    return 'failed';
  };

  const chargeAttemptRef = useRef(0);

  const handleCardCharge = async () => {
    if (!paymentData || !cardNumber || !expiryMonth || !expiryYear || !cvv) return;
    const chargeAttempt = ++chargeAttemptRef.current;
    // A late answer from an older charge may still report success — that is
    // true and worth showing, since it stops a second payment. Anything else
    // from it is dropped once a newer charge owns the screen.
    const mine = () => chargeAttemptRef.current === chargeAttempt;
    setCharging(true);
    setChargePhase('charge');
    setErrorMsg('');

    const ids = paymentData.payment_ids?.length
      ? paymentData.payment_ids
      : [paymentData.payment_id];

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const pollChargeStatus = async (): Promise<'completed' | 'failed' | 'processing'> => {
      const res = await api.get('/customers/widget/payment-status/', {
        params: { payment_ids: ids.join(',') },
        timeout: 15_000,
      });
      if (res.data?.success) return 'completed';
      if (res.data?.processing) return 'processing';
      return 'failed';
    };

    const waitForSettlement = async (): Promise<'completed' | 'failed' | 'processing'> => {
      setChargePhase('verify');
      const deadline = Date.now() + CHARGE_POLL_MAX_MS;
      let last: 'completed' | 'failed' | 'processing' = 'processing';
      while (Date.now() < deadline) {
        try {
          last = await pollChargeStatus();
          if (last !== 'processing') return last;
        } catch {
          // Keep polling through transient network errors after the card was sent.
        }
        await sleep(CHARGE_POLL_INTERVAL_MS);
      }
      return last;
    };

    const showSuccess = () => setStep(isTrial ? 'trial_success' : 'payment_success');
    const setStepIfMine = (next: Step) => { if (mine()) setStep(next); };
    const setErrorIfMine = (message: string) => { if (mine()) setErrorMsg(message); };

    try {
      const res = await api.post(
        '/customers/widget/charge/',
        {
          ...(paymentData.payment_ids
            ? { payment_ids: paymentData.payment_ids }
            : { payment_id: paymentData.payment_id }),
          card_details: {
            card_number: cardNumber.replace(/\s/g, ''),
            expiry_month: parseInt(expiryMonth, 10),
            expiry_year: parseInt(expiryYear, 10),
            cvv,
            card_holder_id: cardHolderId,
          },
        },
        { timeout: CHARGE_TIMEOUT_MS },
      );
      if (res.data.success) {
        showSuccess();
        return;
      }
      if (res.data.processing) {
        const settled = await waitForSettlement();
        if (settled === 'completed') {
          showSuccess();
          return;
        }
        if (settled === 'processing') {
          setErrorIfMine('התשלום התקבל אצל חברת הסליקה ועדיין מאושר אצלנו. אל תשלמו שוב — פנו למשרד אם ההרשמה לא מופיעה.');
          setStepIfMine('payment_pending');
          return;
        }
      }
      const firstError = res.data.error
        ?? res.data.results?.find((r: { success: boolean; error?: string }) => !r.success)?.error;
      const settled = await pollChargeStatus().catch(() => 'failed' as const);
      if (settled === 'completed') {
        showSuccess();
        return;
      }
      setErrorIfMine(firstError || 'התשלום נכשל');
      setStepIfMine('payment_failed');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { success?: boolean; processing?: boolean; error?: string } }; code?: string };
      if (axiosErr.response?.data?.success) {
        showSuccess();
        return;
      }
      const settled = await waitForSettlement();
      if (settled === 'completed') {
        showSuccess();
        return;
      }
      if (settled === 'processing' || axiosErr.code === 'ECONNABORTED' || !axiosErr.response) {
        setErrorIfMine(
          axiosErr.response?.data?.error
          || 'התשלום נשלח ועדיין מאושר. אל תשלמו שוב — אם החיוב עבר, ההרשמה תופיע תוך רגע.',
        );
        setStepIfMine('payment_pending');
        return;
      }
      const msg = axiosErr.response?.data?.error ?? 'שגיאה בסליקה';
      setErrorIfMine(msg);
      setStepIfMine('payment_failed');
    } finally {
      if (mine()) {
        setCharging(false);
        setChargePhase('charge');
      }
    }
  };

  // No wait on this form outlives its deadline — see waitDeadline.ts for why a
  // request's own timeout was not enough on a phone.
  useWaitDeadline(step === 'submitting', registerDeadline, () => {
    // The registration may still land; if it does before anything newer is
    // sent, handleFinalSubmit moves on to payment from here by itself.
    setErrorMsg(REGISTER_OVERDUE_MESSAGE);
    setStep(submittedFromRef.current);
  });

  useWaitDeadline(charging, CHARGE_DEADLINE_MS, () => {
    // The card was sent. Never "failed" on a guess — ask once, and otherwise
    // hand over to the screen that keeps asking.
    chargeAttemptRef.current += 1;
    setCharging(false);
    setChargePhase('charge');
    checkChargeOnce()
      .then((settled) => {
        if (settled === 'completed') {
          setStep(isTrial ? 'trial_success' : 'payment_success');
          return;
        }
        setErrorMsg(CHARGE_OVERDUE_MESSAGE);
        setStep('payment_pending');
      })
      .catch(() => {
        setErrorMsg(CHARGE_OVERDUE_MESSAGE);
        setStep('payment_pending');
      });
  });

  // "Checking the payment" used to be a spinner that never asked anything: it
  // span until the parent pressed a button. It now asks every few seconds, moves
  // on the moment there is an answer, and stops spinning when it runs out of
  // time — saying so, instead of leaving a spinner up for good.
  useEffect(() => {
    if (step !== 'payment_pending' || !pendingChecking) return undefined;
    const round = ++pendingRoundRef.current;
    const deadline = Date.now() + PENDING_POLL_MAX_MS;
    let timer: number | undefined;
    const tick = async () => {
      if (pendingRoundRef.current !== round) return;
      let settled: 'completed' | 'failed' | 'processing' = 'processing';
      try {
        settled = await checkChargeOnce();
      } catch {
        settled = 'processing';
      }
      if (pendingRoundRef.current !== round) return;
      if (settled === 'completed') {
        setStep(isTrial ? 'trial_success' : 'payment_success');
        return;
      }
      if (settled === 'failed') {
        setErrorMsg('חברת הסליקה לא אישרה את החיוב. אפשר לנסות שוב עם אותו כרטיס או עם כרטיס אחר.');
        setStep('payment_failed');
        return;
      }
      if (Date.now() >= deadline) {
        setPendingChecking(false);
        return;
      }
      timer = window.setTimeout(tick, PENDING_POLL_INTERVAL_MS);
    };
    timer = window.setTimeout(tick, PENDING_POLL_INTERVAL_MS);
    return () => {
      pendingRoundRef.current += 1;
      if (timer) window.clearTimeout(timer);
    };
    // checkChargeOnce reads paymentData at call time; the loop restarts only
    // when the screen or the checking state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pendingChecking]);

  useEffect(() => {
    if (step === 'payment_pending') setPendingChecking(true);
  }, [step]);

  // A new basket asks the server again.
  useEffect(() => {
    setHostedMode('unknown');
    setHostedCheckout(null);
  }, [paymentData]);

  // On the payment step, ask once whether this basket pays on Tranzila's page.
  useEffect(() => {
    if (step !== 'payment' || !paymentData || hostedMode !== 'unknown') return;
    const ids = paymentData.payment_ids?.length ? paymentData.payment_ids : [paymentData.payment_id];
    setHostedMode('asking');
    api.post('/customers/widget/checkout/start/', { payment_ids: ids }, { timeout: 30_000 })
      .then((res) => readCheckoutStart(res.data))
      .catch((err: { response?: { status?: number; data?: unknown } }) => (
        // A server without the page (404), a server error or no answer at all:
        // keep the card form rather than stop the parent from paying. Only a
        // plain refusal (a full class, a basket too old) is shown as such.
        !err?.response || err.response.status === 404 || (err.response.status ?? 500) >= 500
          ? ({ kind: 'card_form' } as const)
          : readCheckoutStart(err.response.data)
      ))
      .then((start) => {
        if (start.kind === 'card_form') {
          setHostedMode('card');
          return;
        }
        if (start.kind === 'hosted') {
          hostedDoneRef.current = false;
          setHostedProcessing(false);
          setHostedCheckout({ id: start.checkoutId, url: start.url });
          setHostedMode('hosted');
          return;
        }
        setErrorMsg(start.message);
        setHostedMode('error');
      });
  }, [step, paymentData, hostedMode]);

  const applyCheckout = (status: string | undefined, message?: string) => {
    if (hostedDoneRef.current) return;
    const outcome = checkoutOutcome(status);
    if (outcome === 'waiting') {
      if (cardAccepted(status)) setHostedProcessing(true);
      return;
    }
    hostedDoneRef.current = true;
    setHostedProcessing(false);
    if (outcome === 'paid') {
      setStep(isTrial ? 'trial_success' : 'payment_success');
      return;
    }
    setErrorMsg(message || '');
    if (outcome === 'pending') {
      // The card may be charged: the screen that keeps asking, never a new page.
      setStep('payment_pending');
      return;
    }
    // Declined or refused before any charge: a new try opens a new page.
    setHostedMode('unknown');
    setHostedCheckout(null);
    setStep('payment_failed');
  };

  const askCheckout = async (extra?: { index: string; code: string }) => {
    if (!hostedCheckout) return;
    try {
      const res = await api.get(`/customers/widget/checkout/${hostedCheckout.id}/`, { params: extra, timeout: 15_000 });
      applyCheckout(res.data?.status, res.data?.message);
    } catch {
      // A missed look is not an answer; the next one asks again.
    }
  };

  // The card was approved and the charge is running. Never "failed" on a
  // guess: past the deadline, the screen that keeps asking takes over.
  useWaitDeadline(step === 'payment' && hostedProcessing, HOSTED_CHARGE_DEADLINE_MS, () => {
    if (hostedDoneRef.current) return;
    hostedDoneRef.current = true;
    setHostedProcessing(false);
    setErrorMsg('הכרטיס אושר ועדיין משלימים את התשלום. אל תשלמו שוב — ההרשמה תושלם בעוד רגע.');
    setStep('payment_pending');
  });

  // While the page is up: ask every few seconds, and at once when the result
  // page inside Tranzila's frame says it is done.
  useEffect(() => {
    if (step !== 'payment' || hostedMode !== 'hosted' || !hostedCheckout) return undefined;
    const timer = window.setInterval(() => { void askCheckout(); }, CHECKOUT_POLL_MS);
    const onMessage = (event: MessageEvent) => {
      const msg = readFrameMessage(event.data, hostedCheckout.id);
      if (!msg) return;
      if (msg.result === 'ok') setHostedProcessing(true);
      void askCheckout(msg.index ? { index: msg.index, code: msg.code } : undefined);
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('message', onMessage);
    };
    // askCheckout reads the checkout at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hostedMode, hostedCheckout]);

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const errors: Partial<Record<DetailsFieldKey, string>> = {};
    const parentFirstErr = nameFieldError(parentFirstName);
    const parentLastErr = nameFieldError(parentLastName);
    if (parentFirstErr) errors.parentFirstName = parentFirstErr;
    if (parentLastErr) errors.parentLastName = parentLastErr;
    if (!selfRegistering) {
      const childFirstErr = nameFieldError(childFirstName);
      const childLastErr = nameFieldError(childLastName);
      if (childFirstErr) errors.childFirstName = childFirstErr;
      if (childLastErr) errors.childLastName = childLastErr;
    }

    const parentIdErr = israeliIdFieldError(parentIdNumber);
    if (parentIdErr) errors.parentIdNumber = parentIdErr;
    if (!selfRegistering) {
      const childIdErr = israeliIdFieldError(childIdNumber);
      if (childIdErr) errors.childIdNumber = childIdErr;
      else {
        const normalizedPrimaryId = childIdNumber.replace(/\D/g, '');
        const duplicateInForm = additionalChildren.some(
          (child) => child.idNumber.replace(/\D/g, '') === normalizedPrimaryId && normalizedPrimaryId,
        );
        if (duplicateInForm) errors.childIdNumber = 'ת.ז. כבר בשימוש לילד אחר בטופס';
      }
    }

    const parentPhoneErr = phoneFieldError(parentPhone);
    if (parentPhoneErr) errors.parentPhone = parentPhoneErr;

    const parentEmailErr = emailFieldError(parentEmail);
    if (parentEmailErr) errors.parentEmail = parentEmailErr;

    if (!childBirthDate.trim()) errors.childBirthDate = 'תאריך לידה חובה';
    if (!childGender) errors.childGender = 'יש לבחור מין';

    const usedIdNumbers = new Set<string>();
    if (!selfRegistering && childIdNumber.replace(/\D/g, '')) {
      usedIdNumbers.add(childIdNumber.replace(/\D/g, ''));
    }

    let additionalHasErrors = false;
    const nextAdditionalChildren = additionalChildren.map((child) => {
      const childErrors = validateAdditionalChildFields(child, usedIdNumbers);
      if (child.idNumber.replace(/\D/g, '') && !childErrors.idNumber) {
        usedIdNumbers.add(child.idNumber.replace(/\D/g, ''));
      }
      if (Object.keys(childErrors).length > 0) additionalHasErrors = true;
      return { ...child, errors: childErrors };
    });
    if (additionalChildren.length > 0) {
      setAdditionalChildren(nextAdditionalChildren);
    }

    if (Object.keys(errors).length > 0 || additionalHasErrors) {
      setFieldErrors(errors);
      setErrorMsg('יש לתקן את השדות המסומנים');
      return;
    }
    setFieldErrors({});

    const fullExtra = primaryExtraLessons.find((selection) => selection.isFull);
    if (fullExtra) {
      setErrorMsg(`${fullExtra.displayTitle} מלא — בחרו חוג אחר`);
      return;
    }
    const fullAdditional = nextAdditionalChildren.find((child) =>
      childLessonSelections(child).some((selection) => selection.isFull),
    );
    if (fullAdditional) {
      const name = `${fullAdditional.firstName} ${fullAdditional.lastName}`.trim() || 'הילד הנוסף';
      setErrorMsg(`החוג שנבחר עבור ${name} מלא — בחרו מועד אחר`);
      return;
    }

    if (isTrial) {
      if (!trialLessonDate || !effectiveTrialLessonId) {
        setErrorMsg('יש לבחור תאריך לשיעור הניסיון');
        return;
      }
    }

    setLookingUp(true);
    const lookupChildFirstName = selfRegistering ? parentFirstName : childFirstName;
    const lookupChildLastName = selfRegistering ? parentLastName : childLastName;
    try {
      const lookupRequests: Array<Promise<{ id: 'primary' | string; data: LookupResult }>> = [
        api.post('/customers/widget/lookup/', {
          parent_id_number: parentIdNumber,
          child_first_name: lookupChildFirstName,
          child_last_name: lookupChildLastName,
          lesson_id: isTrial ? effectiveTrialLessonId : lessonId,
          bundle_id: isTrial ? undefined : bundleId,
        }).then((res) => ({ id: 'primary' as const, data: res.data as LookupResult })),
      ];

      for (const child of nextAdditionalChildren) {
        lookupRequests.push(
          api.post('/customers/widget/lookup/', {
            parent_id_number: parentIdNumber,
            child_first_name: child.firstName,
            child_last_name: child.lastName,
            lesson_id: child.selection?.lessonId,
            bundle_id: child.selection?.bundleId,
          }).then((res) => ({ id: child.id, data: res.data as LookupResult })),
        );
      }

      const lookupResults = await Promise.allSettled(lookupRequests);
      let primaryLookup: LookupResult | null = null;
      const lookupByChildId = new Map<string, LookupResult>();

      lookupResults.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        if (result.value.id === 'primary') {
          primaryLookup = result.value.data;
          return;
        }
        lookupByChildId.set(result.value.id, result.value.data);
      });

      setLookup(primaryLookup);
      const resolvedAdditional = nextAdditionalChildren.map((child) => ({
        ...child,
        lookup: lookupByChildId.get(child.id) ?? child.lookup,
      }));
      if (nextAdditionalChildren.length > 0) {
        setAdditionalChildren(resolvedAdditional);
      }

      const primaryBlocked = lookupBlocksLesson(primaryLookup, [
        { lessonId: isTrial ? effectiveTrialLessonId : lessonId },
        ...primaryExtraLessons,
      ]);
      if (primaryBlocked) {
        setErrorMsg(ALREADY_REGISTERED_LESSON);
        return;
      }
      const blockedAdditional = resolvedAdditional.find((child) =>
        lookupBlocksLesson(child.lookup, childLessonSelections(child)),
      );
      if (blockedAdditional) {
        const name = `${blockedAdditional.firstName} ${blockedAdditional.lastName}`.trim() || 'הילד';
        setErrorMsg(`${name} כבר רשום/ה לחוג זה`);
        return;
      }

      if (isTrial) {
        setStep(trialNextStep(trialLessonIsPaid));
        return;
      }

      const queue = buildDiscountQueue(
        primaryLookup,
        resolvedAdditional,
        lookupChildFirstName.trim() || 'ילד 1',
      );

      if (queue.length > 0) {
        setDiscountQueue(queue);
        setDiscountQueueIndex(0);
        setStep('discount_confirm');
      } else {
        setDiscountQueue([]);
        setDiscountQueueIndex(0);
        setStep('consents');
      }
    } catch {
      setStep('consents');
    } finally {
      setLookingUp(false);
    }
  };

  const handleDiscountAnswer = (confirmed: boolean) => {
    const current = discountQueue[discountQueueIndex];
    if (!current) {
      setStep('consents');
      return;
    }

    applyDiscountAnswer(current.id, confirmed);

    if (discountQueueIndex + 1 < discountQueue.length) {
      setDiscountQueueIndex((index) => index + 1);
      return;
    }

    // The queue stays put — it is the step back out of the consents screen.
    setStep('consents');
  };

  /**
   * One step back through the flow the parent actually walked. The step before
   * the first one is the expanded course card, which the page reopens for us.
   */
  const goBackOneStep = () => {
    if (step === 'trial_confirm') {
      setErrorMsg('');
      setStep('details');
      return;
    }
    if (step === 'consents' || step === 'error') {
      setStep(discountQueue.length > 0 ? 'discount_confirm' : 'details');
      return;
    }
    if (step === 'discount_confirm') {
      if (discountQueueIndex > 0) {
        setDiscountQueueIndex((index) => index - 1);
        return;
      }
      setStep('details');
      return;
    }
    onBack();
  };

  /**
   * The trial registration itself, reached by two doors: the consents form
   * (paid trials) and the summary screen (free trials). On success it moves to
   * the next step; on failure it returns the message and leaves the step
   * alone, so each door shows the error where the parent is standing.
   */
  const submitTrialRegistration = async (child: {
    firstName: string;
    lastName: string;
    idNumber: string;
  }, attempt: number): Promise<string | null> => {
    try {
      const res = await api.post('/customers/widget/trial-register/', {
        parent_id_number: parentIdNumber,
        parent_first_name: parentFirstName,
        parent_last_name: parentLastName,
        parent_phone: parentPhone,
        parent_email: parentEmail,
        child_first_name: child.firstName,
        child_last_name: child.lastName,
        child_id_number: child.idNumber,
        child_birth_date: childBirthDate,
        child_gender: childGender,
        course_id: courseId,
        lesson_id: effectiveTrialLessonId,
        trial_lesson_date: trialLessonDate,
        // Accepting the terms is the consent to computerized documents — the
        // terms say so. A free trial's summary has no terms step, so it sends
        // false and nothing is recorded.
        computerized_docs_consent: termsConsent,
        // Kept with the signature, so the office can later see what was ticked.
        // A paid trial comes through the consents step; a free trial's summary
        // has none — both are false and there is no signature to send.
        terms_consent: termsConsent,
        health_consent: healthConsent,
        ...(signature ? { signature } : {}),
      });
      if (attemptRef.current !== attempt) return null;
      if (res.data.requires_payment) {
        // The catalog said free but the course now charges: the payment step
        // reads nothing from the consents, so it can take over from here.
        setPaymentData({
          payment_id: res.data.payment_id,
          final_amount: res.data.final_amount,
          base_amount: res.data.base_amount,
          discount_amount: res.data.discount_amount ?? 0,
          discounts_applied: [],
        });
        setStep('payment');
        return null;
      }
      setStep('trial_success');
      return null;
    } catch (err: unknown) {
      return (
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'אירעה שגיאה. נסה שנית.'
      );
    }
  };

  /** The free trial's one confirm: summary → registered. */
  const handleTrialConfirm = async () => {
    setErrorMsg('');
    const attempt = ++attemptRef.current;
    submittedFromRef.current = 'trial_confirm';
    setRegisterProgress(null);
    setRegisterDeadline(registerDeadlineMs(1));
    setStep('submitting');
    const failure = await submitTrialRegistration({
      firstName: selfRegistering ? parentFirstName : childFirstName,
      lastName: selfRegistering ? parentLastName : childLastName,
      idNumber: selfRegistering ? parentIdNumber : childIdNumber,
    }, attempt);
    if (failure && attemptRef.current === attempt) {
      setErrorMsg(failure);
      setStep('trial_confirm');
    }
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const errors: Partial<Record<ConsentFieldKey, string>> = {};
    if (!healthConsent) {
      errors.health = 'יש לאשר את ההתחייבות לגבי מצב בריאותי';
    }
    if (!termsReadComplete) {
      errors.terms = 'יש לפתוח את התקנון, לגלול עד הסוף ולאשר';
    } else if (!termsConsent) {
      errors.terms = 'יש לאשר את התקנון והנהלים';
    }
    if (!signature) {
      errors.signature = 'נדרשת חתימה';
    }

    if (Object.keys(errors).length > 0) {
      setConsentErrors(errors);
      setErrorMsg('יש להשלים את כל השדות הנדרשים');
      return;
    }
    setConsentErrors({});

    const attempt = ++attemptRef.current;
    const totalCalls = isTrial
      ? 1
      : 1 + primaryExtraLessons.length + additionalChildren.reduce(
        (sum, child) => sum + childLessonSelections(child).length,
        0,
      );
    submittedFromRef.current = 'error';
    setRegisterProgress(totalCalls > 1 ? { done: 0, total: totalCalls } : null);
    setRegisterDeadline(registerDeadlineMs(totalCalls));
    setStep('submitting');
    setErrorMsg('');

    const discountConfirmed = (lookup as (LookupResult & { _confirmed?: boolean }) | null)?._confirmed ?? false;
    const existingChildId = lookup?.child_id ?? '';

    const registerChildFirstName = selfRegistering ? parentFirstName : childFirstName;
    const registerChildLastName = selfRegistering ? parentLastName : childLastName;
    const registerChildIdNumber = selfRegistering ? parentIdNumber : childIdNumber;

    if (isTrial) {
      const failure = await submitTrialRegistration({
        firstName: registerChildFirstName,
        lastName: registerChildLastName,
        idNumber: registerChildIdNumber,
      }, attempt);
      if (failure && attemptRef.current === attempt) {
        setErrorMsg(failure);
        setStep('error');
      }
      return;
    }

    try {
      const paymentResponses: PaymentResponse[] = [];
      const parentPayload = {
        parent_id_number: parentIdNumber,
        parent_first_name: parentFirstName,
        parent_last_name: parentLastName,
        parent_phone: parentPhone,
        parent_email: parentEmail,
        signature,
        // The accepted terms carry the consent (checked above: no submit without them).
        computerized_docs_consent: termsConsent,
        // Kept with the signature, so the office can later see what was ticked.
        terms_consent: termsConsent,
        health_consent: healthConsent,
      };

      const registerChildLessons = async (
        childPayload: Record<string, unknown>,
        selections: Array<{
          courseId: string;
          bundleId?: string;
          lessonId?: string;
          priceOptionId?: string;
        }>,
        discountConfirmedForChild: boolean,
        startingChildId: string,
      ) => {
        let resolvedChildId = startingChildId;
        for (const [index, selection] of selections.entries()) {
          const response = await registerEnrollment({
            ...parentPayload,
            ...childPayload,
            course_id: selection.courseId,
            bundle_id: selection.bundleId,
            lesson_id: selection.lessonId,
            price_option_id: selection.priceOptionId,
            discount_confirmed: index === 0 ? discountConfirmedForChild : Boolean(resolvedChildId),
            existing_child_id: resolvedChildId,
          });
          if (response.child_id) {
            resolvedChildId = response.child_id;
          }
          paymentResponses.push(response);
          if (attemptRef.current === attempt) {
            setRegisterProgress((prev) => (prev ? { ...prev, done: paymentResponses.length } : prev));
          }
        }
      };

      await registerChildLessons(
        {
          child_first_name: registerChildFirstName,
          child_last_name: registerChildLastName,
          child_id_number: registerChildIdNumber,
          child_birth_date: childBirthDate,
          child_gender: childGender,
        },
        [primarySelection, ...primaryExtraLessons],
        discountConfirmed,
        existingChildId,
      );

      for (const child of additionalChildren) {
        const childDiscountConfirmed = (child.lookup as (LookupResult & { _confirmed?: boolean }) | null)?._confirmed ?? false;
        const childExistingId = child.lookup?.child_id ?? '';
        const selections = childLessonSelections(child);
        if (selections.length === 0) {
          throw new Error('חסרה בחירת חוג לילד נוסף');
        }
        await registerChildLessons(
          {
            child_first_name: child.firstName,
            child_last_name: child.lastName,
            child_id_number: child.idNumber,
            child_birth_date: child.birthDate,
            child_gender: child.gender,
          },
          selections,
          childDiscountConfirmed,
          childExistingId,
        );
      }

      const lessonCount = 1 + primaryExtraLessons.length + additionalChildren.reduce(
        (sum, child) => sum + childLessonSelections(child).length,
        0,
      );
      // A newer attempt owns the screen now. This one's answer is dropped.
      if (attemptRef.current !== attempt) return;
      setRegisteredChildCount(1 + additionalChildren.length);
      setRegisteredLessonCount(lessonCount);
      setPaymentData(mergePaymentResponses(paymentResponses));
      setErrorMsg('');
      setStep('payment');
    } catch (err: unknown) {
      if (attemptRef.current !== attempt) return;
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'אירעה שגיאה. נסה שנית.';
      setErrorMsg(msg);
      setStep('error');
    }
  };

  const clearFieldError = (field: DetailsFieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const fieldInputClass = (field: DetailsFieldKey) =>
    `${styles.input}${fieldErrors[field] ? ` ${styles.inputInvalid}` : ''}`;

  const collectParentDetails = () => ({
    parentIdNumber,
    parentFirstName,
    parentLastName,
    parentPhone,
    parentEmail,
  });

  const handleRegisterAnother = () => {
    if (onRegisterAnother) {
      onRegisterAnother(collectParentDetails());
      return;
    }
    onComplete();
  };

  const canRegisterAnother = Boolean(onRegisterAnother) && !selfRegistering;

  const successActions = (
    <div className={styles.successActions}>
      {canRegisterAnother ? (
        <button type="button" onClick={handleRegisterAnother} className={styles.closeButton}>
          רשום ילד נוסף
        </button>
      ) : null}
      <button
        type="button"
        onClick={onComplete}
        className={canRegisterAnother ? styles.outlineButton : styles.closeButton}
      >
        {canRegisterAnother ? 'סיום' : 'סגור'}
      </button>
    </div>
  );

  // The terms, read from a modal. Shared by the consents form (where reading to
  // the end is required) and by the free trial's summary (where the link is
  // there for whoever wants it).
  const termsModal = showTerms ? (
    <div className={styles.termsOverlay} onClick={() => setShowTerms(false)}>
        <div className={styles.termsModal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.termsHeader}>
            <span className={styles.termsModalTitle}>תקנון ונהלים</span>
            <button type="button" className={styles.termsClose} onClick={() => setShowTerms(false)}>✕</button>
          </div>
          <div className={styles.termsBodyWrap}>
            <div
              ref={attachTermsBody}
              className={styles.termsBody}
              onScroll={updateTermsScrollState}
            >
              {loadingTerms ? (
                <SkeletonTextLines label="טוען תקנון..." />
              ) : termsContent ? (
                <div dangerouslySetInnerHTML={{ __html: termsContent }} />
              ) : (
                <p>לא ניתן לטעון את התקנון. נסו שוב מאוחר יותר.</p>
              )}
            </div>
            {termsCanJumpToEnd ? (
              <>
                <span className={styles.termsJumpFade} aria-hidden="true" />
                <button
                  type="button"
                  className={styles.termsJumpButton}
                  onClick={jumpToTermsEnd}
                  aria-label="דילוג לסוף התקנון"
                >
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
          <div className={styles.termsFooter}>
            {!termsScrolledToEnd && !loadingTerms && termsContent ? (
              <p className={styles.termsScrollHint}>גללו עד הסוף כדי לאשר שקראתם את התקנון</p>
            ) : null}
            <button
              type="button"
              className={styles.termsConfirmButton}
              disabled={!termsScrolledToEnd || loadingTerms || !termsContent}
              onClick={confirmTermsRead}
            >
              אישור — קראתי את התקנון והנהלים
            </button>
          </div>
        </div>
      </div>
  ) : null;

  // A course registration walks three steps; a trial keeps its short form as it is.
  const stepBar = isTrial ? null : (
    <StepBar current={step === 'payment' ? 2 : step === 'consents' || step === 'error' || step === 'submitting' ? 1 : 0} />
  );
  const consentsReady = healthConsent && termsReadComplete && termsConsent && Boolean(signature);
  // Everything is approved and signed: the button to send comes into view.
  useEffect(() => {
    if (consentsReady && (step === 'consents' || step === 'error')) {
      consentSubmitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [consentsReady, step]);

  const header = (
    <>
    {stepBar}
    <div className={styles.header}>
      <button
        type="button"
        onClick={goBackOneStep}
        className={styles.backButton}
        aria-label="חזרה לשלב הקודם"
      >
        <ChevronRight size={16} aria-hidden="true" />
        חזרה
      </button>
      <h3 className={styles.title}>{isTrial ? `הרשמה לשיעור ניסיון: ${courseName}` : `הרשמה לחוג: ${courseName}`}</h3>
    </div>
    </>
  );

  if (step === 'details') {
    return (
      <form key="details" noValidate onSubmit={handleDetailsSubmit} className={`${styles.form} ${look.stepIn}`} dir="rtl">
        {header}

        {addingSibling ? (
          <p className={styles.siblingNotice}>
            פרטי ההורה נשמרו מההרשמה הקודמת. מלאו רק את פרטי הילד הנוסף.
          </p>
        ) : null}

        {isAdult && !addingSibling && (
          <label className={styles.selfRegToggle}>
            <input type="checkbox" checked={selfRegistering}
              onChange={(e) => setSelfRegistering(e.target.checked)}
              className={styles.selfRegCheckbox} />
            אני נרשם/ת עבור עצמי
          </label>
        )}

        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleLine} />
            {/* Someone enrolling themselves is filling in their own details, and being
                  asked for a parent's is what makes them hesitate over whose
                  identity number belongs in the field below. */}
              <span className={styles.sectionTitleText}>
                {selfRegistering ? 'הפרטים שלי' : 'פרטי הורה'}
              </span>
            <span className={styles.sectionTitleLine} />
          </div>
          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>שם פרטי</label>
              <input type="text" value={parentFirstName}
                onChange={(e) => { setParentFirstName(e.target.value); clearFieldError('parentFirstName'); }}
                className={fieldInputClass('parentFirstName')} />
              {fieldErrors.parentFirstName ? (
                <p className={styles.fieldError}>{fieldErrors.parentFirstName}</p>
              ) : null}
            </div>
            <div>
              <label className={styles.label}>שם משפחה</label>
              <input type="text" value={parentLastName}
                onChange={(e) => { setParentLastName(e.target.value); clearFieldError('parentLastName'); }}
                className={fieldInputClass('parentLastName')} />
              {fieldErrors.parentLastName ? (
                <p className={styles.fieldError}>{fieldErrors.parentLastName}</p>
              ) : null}
            </div>
            <div>
              <label className={styles.label}>
                {selfRegistering ? 'תעודת זהות שלי *' : 'ת.ז. הורה *'}
              </label>
              <input type="text" inputMode="numeric" value={parentIdNumber}
                onChange={(e) => {
                  setParentIdNumber(sanitizeIsraeliIdInput(e.target.value));
                  clearFieldError('parentIdNumber');
                }}
                className={fieldInputClass('parentIdNumber')} dir="ltr" />
              {fieldErrors.parentIdNumber ? (
                <p className={styles.fieldError}>{fieldErrors.parentIdNumber}</p>
              ) : null}
            </div>
            <div>
              <label className={styles.label}>טלפון נייד</label>
              <input type="tel" inputMode="numeric" value={parentPhone}
                onChange={(e) => {
                  setParentPhone(sanitizePhoneInput(e.target.value));
                  clearFieldError('parentPhone');
                }}
                className={fieldInputClass('parentPhone')} dir="ltr"
                maxLength={PHONE_DIGITS} autoComplete="tel" />
              {fieldErrors.parentPhone ? (
                <p className={styles.fieldError}>{fieldErrors.parentPhone}</p>
              ) : null}
            </div>
            <div className={styles.gridFull}>
              <label className={styles.label}>דוא&quot;ל *</label>
              <input type="text" value={parentEmail}
                onChange={(e) => { setParentEmail(e.target.value); clearFieldError('parentEmail'); }}
                className={fieldInputClass('parentEmail')}
                autoComplete="email" dir="ltr" inputMode="email" />
              {fieldErrors.parentEmail ? (
                <p className={styles.fieldError}>{fieldErrors.parentEmail}</p>
              ) : null}
            </div>
            {selfRegistering && (
              <>
                <div className={styles.fadeIn}>
                  <label className={styles.label}>תאריך לידה *</label>
                  <input type="date" value={childBirthDate}
                    onChange={(e) => { setChildBirthDate(e.target.value); clearFieldError('childBirthDate'); }}
                    className={`${fieldInputClass('childBirthDate')} ${styles.inputDate}`} />
                  {fieldErrors.childBirthDate ? (
                    <p className={styles.fieldError}>{fieldErrors.childBirthDate}</p>
                  ) : null}
                </div>
                <div className={`${styles.fadeIn} ${styles.gridFull}`}>
                  <label className={styles.label}>מין *</label>
                  <div className={styles.genderOptions}>
                    {(['male', 'female'] as const).map((g) => (
                      <label key={g} className={styles.radioLabel}>
                        <input type="radio" name="gender" value={g}
                          checked={childGender === g} onChange={() => { setChildGender(g); clearFieldError('childGender'); }}
                          style={{ accentColor: '#2B3090' }} />
                        {g === 'male' ? 'זכר' : 'נקבה'}
                      </label>
                    ))}
                  </div>
                  {fieldErrors.childGender ? (
                    <p className={styles.fieldError}>{fieldErrors.childGender}</p>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>

        {!selfRegistering && (
          <div className={`${styles.section} ${styles.fadeIn}`}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionTitleLine} />
              <span className={styles.sectionTitleText}>{addingSibling ? 'פרטי הילד הנוסף' : 'פרטי הילד'}</span>
              <span className={styles.sectionTitleLine} />
            </div>
            <div className={styles.grid2}>
              <div>
                <label className={styles.label}>שם פרטי *</label>
                <input type="text" value={childFirstName}
                  onChange={(e) => { setChildFirstName(e.target.value); clearFieldError('childFirstName'); }}
                  className={fieldInputClass('childFirstName')} />
                {fieldErrors.childFirstName ? (
                  <p className={styles.fieldError}>{fieldErrors.childFirstName}</p>
                ) : null}
              </div>
              <div>
                <label className={styles.label}>שם משפחה *</label>
                <input type="text" value={childLastName}
                  onChange={(e) => { setChildLastName(e.target.value); clearFieldError('childLastName'); }}
                  className={fieldInputClass('childLastName')} />
                {fieldErrors.childLastName ? (
                  <p className={styles.fieldError}>{fieldErrors.childLastName}</p>
                ) : null}
              </div>
              <div>
                <label className={styles.label}>ת.ז. ילד *</label>
                <input type="text" inputMode="numeric" value={childIdNumber}
                  onChange={(e) => {
                    setChildIdNumber(sanitizeIsraeliIdInput(e.target.value));
                    clearFieldError('childIdNumber');
                  }}
                  className={fieldInputClass('childIdNumber')} dir="ltr" />
                {fieldErrors.childIdNumber ? (
                  <p className={styles.fieldError}>{fieldErrors.childIdNumber}</p>
                ) : null}
              </div>
              <div>
                <label className={styles.label}>תאריך לידה *</label>
                <input type="date" value={childBirthDate}
                  onChange={(e) => { setChildBirthDate(e.target.value); clearFieldError('childBirthDate'); }}
                  className={`${fieldInputClass('childBirthDate')} ${styles.inputDate}`} />
                {fieldErrors.childBirthDate ? (
                  <p className={styles.fieldError}>{fieldErrors.childBirthDate}</p>
                ) : null}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className={styles.label}>מין *</label>
                <div className={styles.genderOptions}>
                  {(['male', 'female'] as const).map((g) => (
                    <label key={g} className={styles.radioLabel}>
                      <input type="radio" name="gender" value={g}
                        checked={childGender === g} onChange={() => { setChildGender(g); clearFieldError('childGender'); }}
                        style={{ accentColor: '#2B3090' }} />
                      {g === 'male' ? 'זכר' : 'נקבה'}
                    </label>
                  ))}
                </div>
                {fieldErrors.childGender ? (
                  <p className={styles.fieldError}>{fieldErrors.childGender}</p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {canAddExtraLesson ? (
          <div className={styles.primaryLessons}>
            <label className={styles.label}>החוגים שנבחרו</label>
            <SelectedLessonCard selection={primarySelection} />
            {primaryExtraLessons.map((selection, extraIndex) => (
              replacingPrimaryExtraIndex === extraIndex && primaryExtraPickerOpen ? null : (
                <SelectedLessonCard
                  key={`${enrollmentSelectionKey(selection)}-${extraIndex}`}
                  selection={selection}
                  onChange={() => {
                    setReplacingPrimaryExtraIndex(extraIndex);
                    setPrimaryExtraPickerOpen(true);
                  }}
                  onRemove={() => {
                    setPrimaryExtraLessons((prev) => prev.filter((_, itemIndex) => itemIndex !== extraIndex));
                    if (replacingPrimaryExtraIndex === extraIndex) {
                      setPrimaryExtraPickerOpen(false);
                      setReplacingPrimaryExtraIndex(null);
                    }
                  }}
                />
              )
            ))}
          </div>
        ) : null}

        {additionalChildren.map((child, index) => (
          <AdditionalChildSection
            key={child.id}
            index={index}
            child={child}
            catalogDefaultFilters={catalogDefaultFilters}
            onChange={(next) => {
              setAdditionalChildren((prev) => prev.map((item) => (item.id === child.id ? next : item)));
            }}
            onRemove={() => {
              setAdditionalChildren((prev) => prev.filter((item) => item.id !== child.id));
            }}
          />
        ))}

        {canAddAnotherChild || canAddExtraLesson ? (
          <div className={styles.addActions}>
            {canAddAnotherChild && additionalChildren.length < MAX_ADDITIONAL_CHILDREN ? (
              <button
                type="button"
                className={styles.addChildButton}
                onClick={() => {
                  setPrimaryExtraPickerOpen(false);
                  setReplacingPrimaryExtraIndex(null);
                  setAdditionalChildren((prev) => [
                    ...prev,
                    createEmptyAdditionalChild(`child-${Date.now()}-${prev.length}`),
                  ]);
                }}
              >
                + הוסיפו ילד נוסף
              </button>
            ) : null}

            {canAddExtraLesson && primaryExtraLessons.length < MAX_EXTRA_LESSONS && !primaryExtraPickerOpen ? (
              <>
                <button
                  type="button"
                  className={styles.addLessonButton}
                  onClick={() => {
                    setReplacingPrimaryExtraIndex(null);
                    setPrimaryExtraPickerOpen(true);
                  }}
                >
                  + חוג נוסף
                </button>
                <p className={styles.addLessonHint}>
                  {selfRegistering
                    ? 'הוסיפו חוג נוסף לאותו נרשם'
                    : `הוסיפו חוג נוסף עבור ${childFirstName.trim() || 'הילד הראשי'}`}
                </p>
              </>
            ) : null}

            {primaryExtraPickerOpen ? (
              <ExtraLessonPicker
                defaultFilters={catalogDefaultFilters}
                excludedSelectionKeys={primaryExcludedSelectionKeys}
                canCancel
                onCancel={() => {
                  setPrimaryExtraPickerOpen(false);
                  setReplacingPrimaryExtraIndex(null);
                }}
                onSelect={(selection) => {
                  if (replacingPrimaryExtraIndex != null) {
                    setPrimaryExtraLessons((prev) =>
                      prev.map((item, extraIndex) =>
                        extraIndex === replacingPrimaryExtraIndex ? selection : item,
                      ),
                    );
                  } else {
                    setPrimaryExtraLessons((prev) => [...prev, selection]);
                  }
                  setPrimaryExtraPickerOpen(false);
                  setReplacingPrimaryExtraIndex(null);
                }}
              />
            ) : null}
          </div>
        ) : null}

        {isTrial && (
          <div className={`${styles.section} ${styles.fadeIn}`}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionTitleLine} />
              <span className={styles.sectionTitleText}>בחרו תאריך לשיעור הניסיון</span>
              <span className={styles.sectionTitleLine} />
            </div>
            {trialLessonIds.length === 0 ? (
              <p className={styles.helperText}>לא נבחר שיעור — חזרו ובחרו מפגש מהרשימה.</p>
            ) : loadingTrialDates ? (
              <SkeletonLessonOptions />
            ) : trialOccurrences.length === 0 ? (
              <p className={styles.errorText}>אין תאריכים פנויים לשיעור ניסיון כרגע.</p>
            ) : trialOccurrences.every((occ) => occ.is_full) ? (
              <>
                <p className={styles.helperText}>
                  כל התאריכים הקרובים מלאים. נסו שוב בקרוב או בחרו מפגש אחר.
                </p>
                <div className={styles.trialDateList}>
                  {trialOccurrences.map((occ) => (
                    <TrialDateRow key={`${occ.lesson_id ?? 'lesson'}-${occ.date}`} occ={occ} />
                  ))}
                </div>
              </>
            ) : (
              <div className={styles.trialDateList}>
                {trialOccurrences.map((occ) => (
                  <TrialDateRow
                    key={`${occ.lesson_id ?? 'lesson'}-${occ.date}`}
                    occ={occ}
                    checked={trialLessonDate === occ.date && effectiveTrialLessonId === (occ.lesson_id ?? effectiveTrialLessonId)}
                    onPick={() => {
                      setTrialLessonDate(occ.date);
                      if (occ.lesson_id) setSelectedTrialLessonId(occ.lesson_id);
                      setErrorMsg('');
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

        <div className={styles.formActions}>
          <button type="submit" className={styles.submitButton} disabled={lookingUp}>
            {lookingUp ? <span className={styles.spinner} /> : 'המשך'}
          </button>
          <button type="button" className={styles.backPageButton} onClick={onBack} disabled={lookingUp}>
            חזרה לעמוד הקודם
          </button>
        </div>
      </form>
    );
  }

  if (step === 'discount_confirm') {
    const currentDiscount = discountQueue[discountQueueIndex];
    const activeLookup = currentDiscount ? getLookupForDiscountTarget(currentDiscount.id) : lookup;
    if (!activeLookup?.discount_question) {
      return null;
    }
    return (
      <div key={`discount-${discountQueueIndex}`} className={`${styles.form} ${look.stepIn}`} dir="rtl">
        {header}
        {currentDiscount ? (
          <p className={styles.discountContext}>
            {currentDiscount.label ? `עבור ${currentDiscount.label}` : null}
            {discountQueue.length > 1 ? (
              <span className={styles.discountProgress}>
                {' '}
                ({discountQueueIndex + 1} מתוך {discountQueue.length})
              </span>
            ) : null}
          </p>
        ) : null}
        <div className={styles.discountBox}>
          {activeLookup.discount_question}
        </div>
        <div className={styles.buttonRow}>
          <button onClick={() => handleDiscountAnswer(true)} className={styles.primaryButton}>
            כן
          </button>
          <button onClick={() => handleDiscountAnswer(false)} className={styles.secondaryButton}>
            לא
          </button>
        </div>
      </div>
    );
  }

  if (step === 'trial_confirm') {
    const chosen = trialOccurrences.find(
      (occ) => occ.date === trialLessonDate
        && (occ.lesson_id ?? effectiveTrialLessonId) === effectiveTrialLessonId,
    );
    const childName = `${selfRegistering ? parentFirstName : childFirstName} ${selfRegistering ? parentLastName : childLastName}`.trim();
    const parentName = `${parentFirstName} ${parentLastName}`.trim();
    return (
      <form
        key="trial_confirm"
        noValidate
        className={`${styles.form} ${look.stepIn}`}
        dir="rtl"
        onSubmit={(e) => {
          e.preventDefault();
          void handleTrialConfirm();
        }}
      >
        {header}

        <div className={`${styles.section} ${styles.fadeIn}`}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleLine} />
            <span className={styles.sectionTitleText}>סיכום ההרשמה לניסיון</span>
            <span className={styles.sectionTitleLine} />
          </div>
          <div className={styles.paymentSummary}>
            <div className={styles.summaryRow}>
              <span>חוג</span>
              <span>{courseName}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>{selfRegistering ? 'משתתף/ת' : 'ילד/ה'}</span>
              <span>{childName || '—'}</span>
            </div>
            {!selfRegistering && (
              <div className={styles.summaryRow}>
                <span>הורה</span>
                <span>{parentName || '—'}{parentPhone ? ` · ${parentPhone}` : ''}</span>
              </div>
            )}
            <div className={styles.summaryRow}>
              <span>מועד הניסיון</span>
              <span>
                {chosen
                  ? `${chosen.day_name} · ${chosen.label} · ${chosen.start_time}–${chosen.end_time}`
                  : (() => {
                      const [y, m, d] = trialLessonDate.split('-').map(Number);
                      return Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
                        ? new Date(y, m - 1, d).toLocaleDateString('he-IL')
                        : trialLessonDate;
                    })()}
              </span>
            </div>
          </div>
          <p className={styles.helperText}>
            באישור אני מסכים/ה{' '}
            <button type="button" className={styles.termsLink} onClick={openTermsModal}>
              לתקנון ולנהלים
            </button>
            {' '}של קוגומלו.
          </p>
        </div>

        {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

        <button type="submit" className={styles.submitButton}>
          אישור והרשמה לניסיון
        </button>

        {termsModal}
      </form>
    );
  }

  if (step === 'consents' || step === 'error') {
    return (
      <form key="consents" noValidate onSubmit={handleFinalSubmit} className={`${styles.form} ${look.stepIn}`} dir="rtl">
        {header}

        <ConsentSteps
          healthConsent={healthConsent}
          onHealthChange={(checked) => {
            setHealthConsent(checked);
            if (checked) clearConsentError('health');
          }}
          termsReadComplete={termsReadComplete}
          termsOpenedOnce={termsOpenedOnce}
          termsConsent={termsConsent}
          onTermsChange={(checked) => {
            setTermsConsent(checked);
            if (checked) clearConsentError('terms');
          }}
          onOpenTerms={openTermsModal}
          signed={Boolean(signature)}
          onSignature={(value) => {
            setSignature(value);
            if (value) clearConsentError('signature');
          }}
          errors={consentErrors}
          paymentFollows={!isTrial || trialLessonIsPaid}
        />

        {termsModal}

        {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

        <button
          ref={consentSubmitRef}
          type="submit"
          className={`${styles.submitButton}${consentsReady ? ` ${look.readyButton}` : ''}`}
        >
          {isTrial
            ? (trialLessonIsPaid ? 'שלח והמשך לתשלום' : 'שלח והרשם לניסיון')
            : 'שלח והמשך לתשלום'}
        </button>
      </form>
    );
  }

  if (step === 'payment' && paymentData && hostedMode === 'hosted' && hostedProcessing) {
    return (
      <>
        {stepBar}
        <ProcessingPanel
          phase={isTrial && trialLessonIsPaid ? 'trial_charge' : 'charge'}
          amountLabel={formatShekelShort(Number(paymentData.final_amount))}
        />
      </>
    );
  }

  if (step === 'payment' && paymentData && charging) {
    return (
      <>
        {stepBar}
        <ProcessingPanel
          // A paid trial holds one state from the first click to the last, the
          // charge → verify hand-off included. It is a single small payment, and
          // a screen that renames itself halfway through a short wait reads as
          // something having gone wrong.
          phase={isTrial && trialLessonIsPaid ? 'trial_charge' : chargePhase}
          amountLabel={formatShekelShort(Number(paymentData.final_amount))}
        />
      </>
    );
  }

  if (step === 'payment' && paymentData) {
    const summaryTitle = registeredChildCount > 1
      ? `סיכום תשלום עבור ${registeredChildCount} ילדים`
      : registeredLessonCount > 1
        ? `סיכום תשלום עבור ${registeredLessonCount} חוגים`
        : (isTrial ? 'תשלום לשיעור ניסיון' : 'סיכום תשלום');
    const playSummary = summaryPlayedRef.current !== paymentData.payment_id;

    return (
      <div key="payment" className={`${styles.paymentContainer} ${look.stepIn}`} dir="rtl">
        {stepBar}
        <h3 className={styles.title}>
          {isTrial ? `הרשמה לשיעור ניסיון: ${courseName}` : `הרשמה לחוג: ${courseName}`}
        </h3>

        <PaymentSummary
          key={paymentData.payment_id}
          payment={paymentData}
          title={summaryTitle}
          priceLabel={isTrial
            ? 'שיעור ניסיון'
            : (registeredChildCount > 1 || registeredLessonCount > 1 ? 'מחיר החוגים' : 'מחיר החוג')}
          isTrial={isTrial}
          animate={playSummary}
          onSettled={() => {
            if (summaryPlayedRef.current === paymentData.payment_id) return;
            summaryPlayedRef.current = paymentData.payment_id;
            // The figures are in place: bring what the parent does next into view.
            payActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }}
        />

        <div ref={payActionRef} className={styles.paymentContainer}>
        {hostedMode === 'card' ? (
          <>
          <div className={styles.cardFields}>
            <p className={styles.cardSectionTitle}>פרטי כרטיס אשראי</p>
            <div>
              <label className={styles.label}>מספר כרטיס</label>
              <input
                className={styles.input}
                placeholder="4580 4580 4580 4580"
                value={cardNumber}
                onChange={e => setCardNumber(e.target.value)}
              />
            </div>
            <div className={styles.grid3}>
              <div>
                <label className={styles.label}>חודש תפוגה</label>
                <input className={styles.input} placeholder="12" value={expiryMonth} onChange={e => setExpiryMonth(e.target.value)} />
              </div>
              <div>
                <label className={styles.label}>שנת תפוגה</label>
                <input className={styles.input} placeholder="2026" value={expiryYear} onChange={e => setExpiryYear(e.target.value)} />
              </div>
              <div>
                <label className={styles.label}>CVV</label>
                <input className={styles.input} placeholder="123" value={cvv} onChange={e => setCvv(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={styles.label}>תעודת זהות בעל הכרטיס</label>
              <input className={styles.input} placeholder="012345678" value={cardHolderId} onChange={e => setCardHolderId(e.target.value)} />
            </div>
          </div>

          {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

          <button
            type="button"
            onClick={handleCardCharge}
            disabled={charging || !cardNumber || !expiryMonth || !expiryYear || !cvv}
            className={styles.submitButton}
          >
            {charging ? 'מעבד...' : `שלם ${formatShekelShort(Number(paymentData.final_amount))}`}
          </button>
          </>
        ) : hostedMode === 'hosted' && hostedCheckout ? (
          <div className={styles.hostedFrameWrap}>
            <iframe className={styles.hostedFrame} src={hostedCheckout.url} title="תשלום מאובטח" allow="payment" />
            <p className={styles.hostedNote}>
              הכרטיס נבדק ונשמר בעמוד המאובטח של חברת הסליקה, והחיוב מתבצע מיד אחרי האישור. אל תסגרו את החלון.
            </p>
          </div>
        ) : hostedMode === 'error' ? (
          <>
            {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}
            <button
              type="button"
              onClick={() => { setErrorMsg(''); setHostedMode('unknown'); }}
              className={styles.submitButton}
            >
              נסו שוב
            </button>
          </>
        ) : (
          <div className={styles.hostedLoading}>
            <span className={styles.submittingSpinner} />
            <span>פותחים את עמוד התשלום…</span>
          </div>
        )}
        </div>
      </div>
    );
  }

  if (step === 'trial_success') {
    return (
      <div className={styles.resultContainer} dir="rtl">
        <div className={styles.successIcon}>✓</div>
        <p className={styles.resultTitle}>נרשמתם לשיעור ניסיון!</p>
        <p className={styles.resultSubtext}>ניצור איתכם קשר בווטסאפ עם פרטי השיעור.</p>
        {successActions}
      </div>
    );
  }

  if (step === 'payment_success' && paymentData) {
    return (
      <SuccessSummary
        key="payment_success"
        payment={paymentData}
        text={registeredChildCount > 1
          ? `${registeredChildCount} ילדים נרשמו בהצלחה.`
          : registeredLessonCount > 1
            ? `${selfRegistering ? parentFirstName : childFirstName} נרשמ/ה ל-${registeredLessonCount} חוגים.`
            : `${selfRegistering ? parentFirstName : childFirstName} נרשמ/ה לחוג ${courseName}.`}
      >
        {successActions}
      </SuccessSummary>
    );
  }

  if (step === 'payment_success') {
    return (
      <div className={styles.resultContainer} dir="rtl">
        <div className={styles.successIcon}>✓</div>
        <p className={styles.resultTitle}>התשלום בוצע בהצלחה!</p>
        <p className={styles.resultSubtext}>
          {registeredChildCount > 1
            ? `${registeredChildCount} ילדים נרשמו בהצלחה.`
            : registeredLessonCount > 1
              ? `${selfRegistering ? parentFirstName : childFirstName} נרשמ/ה ל-${registeredLessonCount} חוגים.`
              : `${selfRegistering ? parentFirstName : childFirstName} נרשמ/ה לחוג ${courseName}.`}
        </p>
        {successActions}
      </div>
    );
  }

  if (step === 'payment_pending') {
    return (
      <div className={styles.resultContainer} dir="rtl">
        {pendingChecking ? <span className={styles.submittingSpinner} /> : <div className={styles.failIcon}>!</div>}
        <p className={styles.resultTitle}>{pendingChecking ? 'בודקים את התשלום' : 'עדיין אין אישור מחברת הסליקה'}</p>
        <p className={styles.resultSubtext}>
          {errorMsg || 'הכרטיס כבר נשלח לסליקה. אל תשלמו שוב.'}
        </p>
        {!pendingChecking && (
          <p className={styles.resultSubtext}>
            אל תשלמו שוב. אם ההרשמה לא מופיעה תוך כמה דקות — צרו איתנו קשר ונבדוק מול חברת הסליקה.
          </p>
        )}
        <div className={styles.resultActions}>
          {/* Asks the server again. It used to reopen the card form, which on
              this screen is an invitation to pay twice. */}
          <button
            type="button"
            onClick={() => setPendingChecking(true)}
            className={styles.primaryButton}
            disabled={pendingChecking}
          >
            {pendingChecking ? 'בודקים…' : 'בדקו שוב'}
          </button>
          <button type="button" onClick={onComplete} className={styles.outlineButton}>
            סגור
          </button>
        </div>
      </div>
    );
  }

  if (step === 'payment_failed') {
    return (
      <div className={styles.resultContainer} dir="rtl">
        <div className={styles.failIcon}>✗</div>
        <p className={styles.resultTitle}>התשלום נכשל</p>
        <p className={styles.resultSubtext}>{errorMsg || 'אנא נסה שנית או פנה לצוות.'}</p>
        <div className={styles.resultActions}>
          <button
            type="button"
            onClick={() => { setErrorMsg(''); setStep('payment'); }}
            className={styles.primaryButton}
          >
            נסה שנית
          </button>
          <button type="button" onClick={onComplete} className={styles.outlineButton}>
            סגור
          </button>
        </div>
      </div>
    );
  }

  if (step === 'submitting') {
    return (
      <>
        {stepBar}
        <ProcessingPanel phase="register" progress={registerProgress ?? undefined} />
      </>
    );
  }

  // Nothing else should arrive here. When something does — a payment step with
  // no payment to show — it used to fall through to the spinner above and spin
  // for good. Say so, and give the parent a way back.
  return (
    <div className={styles.resultContainer} dir="rtl">
      <div className={styles.failIcon}>!</div>
      <p className={styles.resultTitle}>משהו השתבש בדרך</p>
      <p className={styles.resultSubtext}>
        {errorMsg || 'הפרטים שמילאתם נשמרו בטופס. חזרו אליו ונסו שוב.'}
      </p>
      <div className={styles.resultActions}>
        <button type="button" onClick={() => { setErrorMsg(''); setStep('details'); }} className={styles.primaryButton}>
          חזרה לטופס
        </button>
        <button type="button" onClick={onComplete} className={styles.outlineButton}>
          סגור
        </button>
      </div>
    </div>
  );
}
