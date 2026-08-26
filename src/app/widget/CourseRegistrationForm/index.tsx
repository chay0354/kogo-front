'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import SignatureCanvas from '../SignatureCanvas';
import styles from './index.module.css';
import { israeliIdFieldError, sanitizeIsraeliIdInput } from '@/lib/israeliId';
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
import type { Props, Step, LookupResult, PaymentResponse, TrialOccurrence } from './types';

export type { CourseLesson } from './types';

const MIN_NAME_LENGTH = 2;
const REQUIRED = 'שדה חובה';
const NAME_TOO_SHORT = `יש להזין לפחות ${MIN_NAME_LENGTH} תווים`;
const MAX_ADDITIONAL_CHILDREN = 3;
const CHARGE_TIMEOUT_MS = 90_000;
const CHARGE_POLL_INTERVAL_MS = 2_000;
const CHARGE_POLL_MAX_MS = 60_000;

type DiscountQueueItem = {
  id: 'primary' | string;
  label: string;
};

type NameFieldKey = 'parentFirstName' | 'parentLastName' | 'childFirstName' | 'childLastName';
type IdFieldKey = 'parentIdNumber' | 'childIdNumber';
type DetailsFieldKey = NameFieldKey | IdFieldKey | 'parentPhone' | 'parentEmail' | 'childBirthDate' | 'childGender';
type ConsentFieldKey = 'health' | 'terms' | 'signature';

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
  const [termsConsent, setTermsConsent] = useState(false);
  const [termsReadComplete, setTermsReadComplete] = useState(false);
  const [termsScrolledToEnd, setTermsScrolledToEnd] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [consentErrors, setConsentErrors] = useState<Partial<Record<ConsentFieldKey, string>>>({});
  const termsBodyRef = useRef<HTMLDivElement>(null);

  // Payment step
  const [paymentData, setPaymentData] = useState<PaymentResponse | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardHolderId, setCardHolderId] = useState('');
  const [charging, setCharging] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
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
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom) setTermsScrolledToEnd(true);
  }, []);

  useEffect(() => {
    if (!showTerms || loadingTerms) return;
    const frame = requestAnimationFrame(() => {
      updateTermsScrollState();
      const el = termsBodyRef.current;
      if (!el) return;
      if (el.scrollHeight <= el.clientHeight + 1) {
        setTermsScrolledToEnd(true);
      } else if (!termsReadComplete) {
        setTermsScrolledToEnd(false);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [showTerms, loadingTerms, termsContent, termsReadComplete, updateTermsScrollState]);

  const openTermsModal = () => {
    setShowTerms(true);
    if (!termsReadComplete) {
      setTermsScrolledToEnd(false);
    }
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
      subscription_start_date: responses.find((response) => response.subscription_start_date)?.subscription_start_date,
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
        subscription_start_date: res.data.subscription_start_date,
        discounts_applied: res.data.payments.flatMap(
          (payment: { discounts_applied?: Array<{ name: string; amount: number }> }) => payment.discounts_applied ?? [],
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

  const handleCardCharge = async () => {
    if (!paymentData || !cardNumber || !expiryMonth || !expiryYear || !cvv) return;
    setCharging(true);
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
          setErrorMsg('התשלום התקבל אצל חברת הסליקה ועדיין מאושר אצלנו. אל תשלמו שוב — פנו למשרד אם ההרשמה לא מופיעה.');
          setStep('payment_pending');
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
      setErrorMsg(firstError || 'התשלום נכשל');
      setStep('payment_failed');
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
        setErrorMsg(
          axiosErr.response?.data?.error
          || 'התשלום נשלח ועדיין מאושר. אל תשלמו שוב — אם החיוב עבר, ההרשמה תופיע תוך רגע.',
        );
        setStep('payment_pending');
        return;
      }
      const msg = axiosErr.response?.data?.error ?? 'שגיאה בסליקה';
      setErrorMsg(msg);
      setStep('payment_failed');
    } finally {
      setCharging(false);
    }
  };

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

    if (isTrial) {
      if (!trialLessonDate || !effectiveTrialLessonId) {
        setErrorMsg('יש לבחור תאריך לשיעור הניסיון');
        return;
      }
      setStep('consents');
      return;
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
        }).then((res) => ({ id: 'primary' as const, data: res.data as LookupResult })),
      ];

      for (const child of nextAdditionalChildren) {
        lookupRequests.push(
          api.post('/customers/widget/lookup/', {
            parent_id_number: parentIdNumber,
            child_first_name: child.firstName,
            child_last_name: child.lastName,
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
      if (nextAdditionalChildren.length > 0) {
        setAdditionalChildren((prev) =>
          prev.map((child) => ({
            ...child,
            lookup: lookupByChildId.get(child.id) ?? child.lookup,
          })),
        );
      }

      const queue = buildDiscountQueue(
        primaryLookup,
        nextAdditionalChildren.map((child) => ({
          ...child,
          lookup: lookupByChildId.get(child.id) ?? child.lookup,
        })),
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

    setDiscountQueue([]);
    setDiscountQueueIndex(0);
    setStep('consents');
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

    setStep('submitting');
    setErrorMsg('');

    const discountConfirmed = (lookup as (LookupResult & { _confirmed?: boolean }) | null)?._confirmed ?? false;
    const existingChildId = lookup?.child_id ?? '';

    const registerChildFirstName = selfRegistering ? parentFirstName : childFirstName;
    const registerChildLastName = selfRegistering ? parentLastName : childLastName;
    const registerChildIdNumber = selfRegistering ? parentIdNumber : childIdNumber;

    if (isTrial) {
      try {
        const res = await api.post('/customers/widget/trial-register/', {
          parent_id_number: parentIdNumber,
          parent_first_name: parentFirstName,
          parent_last_name: parentLastName,
          parent_phone: parentPhone,
          parent_email: parentEmail,
          child_first_name: registerChildFirstName,
          child_last_name: registerChildLastName,
          child_id_number: registerChildIdNumber,
          child_birth_date: childBirthDate,
          child_gender: childGender,
          course_id: courseId,
          lesson_id: effectiveTrialLessonId,
          trial_lesson_date: trialLessonDate,
        });
        if (res.data.requires_payment) {
          setPaymentData({
            payment_id: res.data.payment_id,
            final_amount: res.data.final_amount,
            base_amount: res.data.base_amount,
            discount_amount: res.data.discount_amount ?? 0,
            discounts_applied: [],
          });
          setStep('payment');
          return;
        }
        setStep('trial_success');
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'אירעה שגיאה. נסה שנית.';
        setErrorMsg(msg);
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
      setRegisteredChildCount(1 + additionalChildren.length);
      setRegisteredLessonCount(lessonCount);
      setPaymentData(mergePaymentResponses(paymentResponses));
      setStep('payment');
    } catch (err: unknown) {
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

  const header = (
    <div className={styles.header}>
      <button
        type="button"
        onClick={step === 'consents' || step === 'discount_confirm' ? () => setStep('details') : onBack}
        className={styles.backLink}
      >
        ← חזרה
      </button>
      <h3 className={styles.title}>{isTrial ? `הרשמה לשיעור ניסיון: ${courseName}` : `הרשמה לחוג: ${courseName}`}</h3>
    </div>
  );

  if (step === 'details') {
    return (
      <form noValidate onSubmit={handleDetailsSubmit} className={styles.form} dir="rtl">
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
            <span className={styles.sectionTitleText}>פרטי הורה</span>
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
              <label className={styles.label}>ת.ז. הורה *</label>
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
              <p className={styles.helperText}>טוען תאריכים זמינים...</p>
            ) : trialOccurrences.length === 0 ? (
              <p className={styles.errorText}>אין תאריכים פנויים לשיעור ניסיון כרגע.</p>
            ) : (
              <div className={styles.trialDateList}>
                {trialOccurrences.map((occ) => (
                  <label
                    key={`${occ.lesson_id ?? 'lesson'}-${occ.date}`}
                    className={`${styles.trialDateOption} ${trialLessonDate === occ.date && effectiveTrialLessonId === (occ.lesson_id ?? effectiveTrialLessonId) ? styles.trialDateOptionSelected : ''}`}
                  >
                    <input
                      type="radio"
                      name="trialLessonDate"
                      value={occ.date}
                      checked={trialLessonDate === occ.date && effectiveTrialLessonId === (occ.lesson_id ?? effectiveTrialLessonId)}
                      onChange={() => {
                        setTrialLessonDate(occ.date);
                        if (occ.lesson_id) setSelectedTrialLessonId(occ.lesson_id);
                        setErrorMsg('');
                      }}
                      className={styles.trialDateRadio}
                    />
                    <span className={styles.trialDateLabel}>
                      {occ.day_name} · {occ.label}
                    </span>
                    <span className={styles.trialDateTime}>
                      {occ.start_time}–{occ.end_time}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

        <button type="submit" className={styles.submitButton} disabled={lookingUp}>
          {lookingUp ? <span className={styles.spinner} /> : 'המשך'}
        </button>
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
      <div className={styles.form} dir="rtl">
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

  if (step === 'consents' || step === 'error') {
    return (
      <form noValidate onSubmit={handleFinalSubmit} className={styles.form} dir="rtl">
        {header}

        <label className={styles.consentLabel}>
          <input type="checkbox" checked={healthConsent}
            onChange={(e) => {
              setHealthConsent(e.target.checked);
              if (e.target.checked) clearConsentError('health');
            }}
            className={styles.checkbox} />
          <span>אני מתחייב להודיע על כל שינוי במצב הבריאותי המשפיע על השתתפות הילד בפעילות.</span>
        </label>
        {consentErrors.health ? (
          <p className={styles.fieldError}>{consentErrors.health}</p>
        ) : null}

        <div className={styles.termsConsentBlock}>
          <label className={`${styles.consentLabel} ${!termsReadComplete ? styles.consentLabelDisabled : ''}`}>
            <input type="checkbox" checked={termsConsent}
              disabled={!termsReadComplete}
              onChange={(e) => {
                setTermsConsent(e.target.checked);
                if (e.target.checked) clearConsentError('terms');
              }}
              className={styles.checkbox} />
            <span>
              אני מאשר/ת שקראתי בעיון את{' '}
              <button type="button" className={styles.termsLink} onClick={openTermsModal}>
                התקנון והנהלים
              </button>
              , אני מסכים/ה לכל התנאים ומתחייב/ת לשלם את שכר הלימוד כנדרש.
            </span>
          </label>
          {!termsReadComplete ? (
            <p className={styles.helperText}>יש לפתוח את התקנון ולגלול עד הסוף לפני האישור</p>
          ) : null}
          {consentErrors.terms ? (
            <p className={styles.fieldError}>{consentErrors.terms}</p>
          ) : null}
        </div>

        <div className={`${styles.signatureWrapper}${consentErrors.signature ? ` ${styles.signatureInvalid}` : ''}`}>
          <label className={styles.label}>חתימה *</label>
          <SignatureCanvas onChange={(value) => {
            setSignature(value);
            if (value) clearConsentError('signature');
          }} />
          {consentErrors.signature ? (
            <p className={styles.fieldError}>{consentErrors.signature}</p>
          ) : null}
        </div>

        {showTerms && (
          <div className={styles.termsOverlay} onClick={() => setShowTerms(false)}>
            <div className={styles.termsModal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.termsHeader}>
                <span className={styles.termsModalTitle}>תקנון ונהלים</span>
                <button type="button" className={styles.termsClose} onClick={() => setShowTerms(false)}>✕</button>
              </div>
              <div
                ref={termsBodyRef}
                className={styles.termsBody}
                onScroll={updateTermsScrollState}
              >
                {loadingTerms ? (
                  <p>טוען תקנון...</p>
                ) : termsContent ? (
                  <div dangerouslySetInnerHTML={{ __html: termsContent }} />
                ) : (
                  <p>לא ניתן לטעון את התקנון. נסו שוב מאוחר יותר.</p>
                )}
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
        )}

        {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

        <button type="submit" className={styles.submitButton}>
          {isTrial
            ? (trialLessonIsPaid ? 'שלח והמשך לתשלום' : 'שלח והרשם לניסיון')
            : 'שלח והמשך לתשלום'}
        </button>
      </form>
    );
  }

  if (step === 'payment' && paymentData) {
    return (
      <div className={styles.paymentContainer} dir="rtl">
        <h3 className={styles.title}>
          {isTrial ? `הרשמה לשיעור ניסיון: ${courseName}` : `הרשמה לחוג: ${courseName}`}
        </h3>

        <div className={styles.paymentSummary}>
          <p className={styles.summaryTitle}>
            {registeredChildCount > 1
              ? `סיכום תשלום עבור ${registeredChildCount} ילדים`
              : registeredLessonCount > 1
                ? `סיכום תשלום עבור ${registeredLessonCount} חוגים`
                : (isTrial ? 'תשלום לשיעור ניסיון' : 'סיכום תשלום')}
          </p>
          <div className={styles.summaryRow}>
            <span>מחיר בסיס</span>
            <span>₪{Number(paymentData.base_amount).toFixed(2)}</span>
          </div>
          {paymentData.discount_amount > 0 && (
            <div className={styles.discountRow}>
              <span>הנחה</span>
              <span>-₪{Number(paymentData.discount_amount).toFixed(2)}</span>
            </div>
          )}
          {(paymentData.prorated_amount ?? 0) > 0 && (
            <div className={styles.summaryRow}>
              <span>מנוי חודשי (יחסי)</span>
              <span>₪{Number(paymentData.prorated_amount).toFixed(2)}</span>
            </div>
          )}
          {(paymentData.registration_fee ?? 0) > 0 && (
            <div className={styles.summaryRow}>
              <span>דמי רישום (חד-פעמי)</span>
              <span>₪{Number(paymentData.registration_fee).toFixed(2)}</span>
            </div>
          )}
          <div className={styles.totalRow}>
            <span>לתשלום כעת</span>
            <span className={styles.totalAmount}>₪{Number(paymentData.final_amount).toFixed(2)}</span>
          </div>
          {!isTrial && paymentData.subscription_start_date && (
            <p className={styles.billingNote}>
              דמי רישום יגבו עכשיו והוראת קבע תתחיל ב-1.9
            </p>
          )}
        </div>

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
          {charging ? 'מעבד...' : `שלם ₪${Number(paymentData.final_amount).toFixed(2)}`}
        </button>
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
        <span className={styles.submittingSpinner} />
        <p className={styles.resultTitle}>בודקים את התשלום</p>
        <p className={styles.resultSubtext}>
          {errorMsg || 'הכרטיס כבר נשלח לסליקה. אל תשלמו שוב.'}
        </p>
        <div className={styles.resultActions}>
          <button
            type="button"
            onClick={() => { setErrorMsg(''); setStep('payment'); }}
            className={styles.primaryButton}
          >
            בדקו שוב
          </button>
          <button type="button" onClick={onBack} className={styles.outlineButton}>
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
          <button type="button" onClick={onBack} className={styles.outlineButton}>
            סגור
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.submittingContainer} dir="rtl">
      <span className={styles.submittingSpinner} />
      שולח פרטים, אנא המתן...
    </div>
  );
}
