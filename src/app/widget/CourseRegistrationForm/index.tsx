'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import styles from './index.module.css';
import look from './newLook.module.css';
import { isValidIsraeliId, israeliIdFieldError, sanitizeIsraeliIdInput } from '@/lib/israeliId';
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
import TrialInfo from './TrialInfo';
import { formTitle, lessonCardLine, lessonNameForCard } from './formHeading';
import LessonHead from './LessonHead';
import ResultScreen from './ResultScreen';
import TrialCalendarButton from './TrialCalendarButton';
import { formatShekelShort, paymentSummaryModel } from './paymentSummaryModel';
import MaskedField from './MaskedField';
import Reveal from './Reveal';
import { KnownParentCard, KnownStrip } from './KnownParentCard';
import {
  askIdentify,
  deviceId,
  fetchIdentifyConfig,
  isMobilePhone,
  nextPairMove,
  pairHintError,
  type IdentifyAnswer,
  type IdentifyConfig,
  type KnownChild,
  type KnownParent,
} from './identification';
import { quoteItems, selectionFields, toPaymentResponse, type PlanChild } from './registrationPlan';
import { useTypedFill, type FillStep } from './useTypedFill';
import { consentErrors as everyConsentError, firstMissingConsent, type ConsentKey } from './consentCheck';
import { prefersReducedMotion } from '../widgetMotion';
import { registerDeadlineMs, useWaitDeadline, WAIT_SLACK_MS } from './waitDeadline';
import type { ProcessingPhase } from './processingCopy';
import { SkeletonLessonOptions, SkeletonTextLines } from '../WidgetSkeletons/WidgetSkeletons';
import { trialNextStep, trialWhen } from './trialFlow';
import {
  CHECKOUT_POLL_MS,
  HOSTED_CHARGE_DEADLINE_MS,
  cardAccepted,
  checkoutOutcome,
  checkoutSettlement,
  readCheckoutStart,
  readFrameMessage,
} from '@/lib/courseCheckout';
import type { Props, Step, LookupResult, PaymentResponse, TrialOccurrence } from './types';

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
type ConsentFieldKey = ConsentKey;

/** Where each screen stands in the flow, to tell a step forward from a step back. */
const STEP_ORDER: Record<Step, number> = {
  details: 0,
  discount_confirm: 1,
  trial_confirm: 1,
  summary: 1,
  consents: 2,
  error: 2,
  submitting: 3,
  payment: 4,
  payment_failed: 5,
  payment_pending: 5,
  payment_success: 6,
  trial_success: 6,
};
/** The shortest the "checking whether you are with us" line stays up. */
const IDENTIFY_LINE_MIN_MS = 400;
/** How long a screen takes to leave before the next one arrives. */
const SCREEN_LEAVE_MS = 200;
/** The last station stays green this long before the final screen. */
const APPROVED_SHOW_MS = 900;

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
  lessonLine = '',
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

  // ── a returning parent ──────────────────────────────────────────────────
  // A course registration opens on two fields, the identity number and the
  // phone. A trial and an adult signing themselves up keep the form they had;
  // so does "another child" for a parent who was not identified, whose details
  // are already in hand.
  const idFirst = !isTrial && !isAdult && (!addingSibling || Boolean(initialParent?.known));
  // Null until the server says whether identification is on.
  const [identifyConfig, setIdentifyConfig] = useState<IdentifyConfig | null>(null);
  const [idStage, setIdStage] = useState<'waiting' | 'checking' | 'unknown' | 'near' | 'known' | 'manual'>(
    initialParent?.known ? 'known' : 'waiting',
  );
  const [known, setKnown] = useState<KnownParent | null>(initialParent?.known ?? null);
  const [nearOffer, setNearOffer] = useState<{ lastDigit: string; nearToken: string } | null>(null);
  // A similar number was corrected to the card's: no phone was typed, and the hidden one shows.
  const [phoneFromCard, setPhoneFromCard] = useState(Boolean(initialParent?.phoneFromCard));
  // "I'll fill it in myself" was said while the phone shown was the card's: the form stays open until one is typed.
  const manualAwaitsPhoneRef = useRef(false);
  const bookedTrialRef = useRef<{ lessonId: string; date: string; when: { day: string; hours: string } } | null>(null);
  // Who is being registered: a child from the family's list, another child, or not chosen yet.
  const [pick, setPick] = useState<KnownChild | 'new' | null>(null);
  // A detail of the chosen child was changed: this is now a new child, and the card is left alone.
  const [childEdited, setChildEdited] = useState(false);
  // Hidden fields the parent pressed to retype.
  const [openedFields, setOpenedFields] = useState<Set<string>>(
    () => new Set(
      initialParent?.known
        ? (['parentFirstName', 'parentLastName', 'parentEmail'] as const).filter((key) => Boolean(initialParent[key]))
        : [],
    ),
  );
  const [fillRun, setFillRun] = useState(0);
  const [fillDone, setFillDone] = useState(false);
  const identifyRunRef = useRef(0);
  const lastIdentifyKeyRef = useRef(
    initialParent?.known ? `${initialParent.parentIdNumber}|${initialParent.parentPhone}` : '',
  );
  const topRowRef = useRef<HTMLDivElement | null>(null);
  const welcomeRef = useRef<HTMLDivElement | null>(null);
  // The height the card (or the strip) had just before the other one took its place.
  const welcomeFromRef = useRef(0);
  const parentFieldsRef = useRef<HTMLDivElement | null>(null);
  const childSectionRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  // The price before the signature: the server's quote of this very form.
  const [quote, setQuote] = useState<PaymentResponse | null>(null);
  // 'ready' once a quote was shown; 'unavailable' when the server gave none
  // (an older server, a limit, no network) and the form went on without it.
  const [quoteState, setQuoteState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [quoteSettled, setQuoteSettled] = useState(false);
  const quoteRunRef = useRef(0);
  const summaryActionRef = useRef<HTMLButtonElement | null>(null);
  // The screen on show is on its way out: forward it leaves to the right, back to the left.
  const [leaving, setLeaving] = useState<'forward' | 'back' | null>(null);
  /** One screen leaves, and then `arrive` puts the next one up. */
  const leaveScreenThen = (back: boolean, arrive: () => void) => {
    if (prefersReducedMotion()) {
      arrive();
      return;
    }
    setLeaving(back ? 'back' : 'forward');
    window.setTimeout(() => {
      setLeaving(null);
      arrive();
    }, SCREEN_LEAVE_MS);
  };

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
  const [consentMissTick, setConsentMissTick] = useState(0);
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
  // The charge went through: the last station is green for a moment before the final screen.
  const [chargeApproved, setChargeApproved] = useState(false);
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

  // ── identification ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!idFirst) return undefined;
    let cancelled = false;
    void fetchIdentifyConfig().then((config) => {
      if (!cancelled) setIdentifyConfig(config);
    });
    return () => {
      cancelled = true;
    };
  }, [idFirst]);

  const identifyOn = idFirst && identifyConfig?.enabled === true;
  const pickedKid = pick && pick !== 'new' ? pick : null;
  // The parent was identified and chose who to register: the hidden details stay on the server.
  const identified = idFirst && idStage === 'known' && known !== null && pick !== null;
  // The two numbers the form opens on.
  const idOk = parentIdNumber.length === 9 && isValidIsraeliId(parentIdNumber);
  const phoneOk = isMobilePhone(parentPhone);
  const idHintError = idFirst && !phoneFromCard ? pairHintError(parentIdNumber, idOk, parentPhone, phoneOk) : '';
  // Identification is switched off on the server: the two numbers still come
  // first, and the rest opens once both are in — as for a parent we do not know.
  const openWithoutIdentify = idFirst && identifyConfig !== null && !identifyOn && idOk && phoneOk;
  // The rest of the form: open once we know whether this parent is known, and — if so — who is registered.
  const formOpen = !idFirst
    || openWithoutIdentify
    || idStage === 'unknown' || idStage === 'near' || idStage === 'manual'
    || identified;

  /** The form opened empty: the cursor waits in the parent's first name. */
  const focusParentName = () => window.setTimeout(
    () => parentFieldsRef.current?.querySelector('input')?.focus({ preventScroll: true }),
    350,
  );
  /** The fields that just opened come into view. */
  const followParentFields = () => window.setTimeout(
    () => parentFieldsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
    540,
  );
  useEffect(() => {
    if (!openWithoutIdentify) return undefined;
    const timers = [followParentFields(), focusParentName()];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // The two helpers read the form at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openWithoutIdentify]);

  /** Forget what the server told us about this parent. Typed details are kept; the card's are not. */
  const dropIdentification = (stage: 'waiting' | 'checking' | 'unknown' | 'manual') => {
    if (pickedKid && !childEdited) {
      // These came from the card, not from the parent's hands.
      setChildFirstName('');
      setChildGender('');
    }
    setKnown(null);
    setNearOffer(null);
    setPick(null);
    setChildEdited(false);
    setOpenedFields(new Set());
    setFillDone(false);
    setIdStage(stage);
  };

  const applyIdentifyAnswer = (answer: IdentifyAnswer) => {
    if (answer.status === 'known') {
      setKnown(answer.parent);
      setNearOffer(null);
      setPick(null);
      setIdStage('known');
      window.setTimeout(() => topRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 140);
      return;
    }
    if (answer.status === 'near') {
      setNearOffer({ lastDigit: answer.lastDigit, nearToken: answer.nearToken });
      setIdStage('near');
      return;
    }
    setIdStage('unknown');
    followParentFields();
    focusParentName();
  };

  // Both numbers are in and valid: ask, once per pair. Any change to them starts
  // over — also after "I'll fill it in myself".
  useEffect(() => {
    if (!identifyOn || phoneFromCard) return;
    const key = `${parentIdNumber}|${parentPhone}`;
    const move = nextPairMove({
      idOk,
      phoneOk,
      key,
      lastKey: lastIdentifyKeyRef.current,
      manualAwaitsPhone: idStage === 'manual' && manualAwaitsPhoneRef.current,
    });
    if (move === 'stay') return;
    manualAwaitsPhoneRef.current = false;
    if (move === 'settle') {
      lastIdentifyKeyRef.current = key;
      return;
    }
    if (move === 'wait') {
      lastIdentifyKeyRef.current = '';
      identifyRunRef.current += 1;
      if (idStage !== 'waiting') dropIdentification('waiting');
      return;
    }
    lastIdentifyKeyRef.current = key;
    const run = ++identifyRunRef.current;
    dropIdentification('checking');
    const started = Date.now();
    void askIdentify({ parentIdNumber, parentPhone }, identifyConfig?.ticket ?? '').then((answer) => {
      // The parent waits only as long as the server takes. The floor is the
      // server's own shortest answer, so it only keeps the line from flashing
      // when no answer came at all.
      window.setTimeout(() => {
        if (identifyRunRef.current === run) applyIdentifyAnswer(answer);
      }, Math.max(0, IDENTIFY_LINE_MIN_MS - (Date.now() - started)));
    });
    // The stage and the helpers are read at call time; only the two numbers start a look-up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentIdNumber, parentPhone, identifyOn, phoneFromCard]);

  /** "A similar number is on file — press to update": the card's number is taken, shown hidden. */
  const acceptNearPhone = () => {
    if (!nearOffer) return;
    const offer = nearOffer;
    const run = ++identifyRunRef.current;
    setNearOffer(null);
    setIdStage('checking');
    void askIdentify({ nearToken: offer.nearToken }, identifyConfig?.ticket ?? '').then((answer) => {
      if (identifyRunRef.current !== run) return;
      if (answer.status === 'known') {
        setPhoneFromCard(true);
        setParentPhone('');
        clearFieldError('parentPhone');
      }
      applyIdentifyAnswer(answer.status === 'near' ? { status: 'unknown' } : answer);
    });
  };

  /** The parent pressed the hidden phone: it is typed again, and the look-up starts over. */
  const retypePhone = () => {
    setPhoneFromCard(false);
    setParentPhone('');
    lastIdentifyKeyRef.current = '';
    identifyRunRef.current += 1;
    dropIdentification('waiting');
  };

  /** Who is being registered: a child from the list, or another one. */
  const chooseChild = (kid: KnownChild | 'new') => {
    welcomeFromRef.current = welcomeRef.current?.offsetHeight ?? 0;
    setPick(kid);
    setChildEdited(false);
    setFieldErrors({});
    setErrorMsg('');
    setChildFirstName(kid === 'new' ? '' : kid.firstName);
    setChildLastName('');
    setChildIdNumber('');
    setChildBirthDate('');
    setChildGender(kid === 'new' ? '' : kid.gender);
    setOpenedFields((prev) => new Set([...prev].filter((key) => key.startsWith('parent'))));
    setFillDone(false);
    setFillRun((run) => run + 1);
    // The page moves ahead of the filling: the strip goes to the top while the fields are still opening.
    window.setTimeout(() => welcomeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 160);
  };

  const pickAgain = () => {
    welcomeFromRef.current = welcomeRef.current?.offsetHeight ?? 0;
    setPick(null);
    setChildEdited(false);
    setFillDone(false);
    setChildFirstName('');
    setChildLastName('');
    setChildIdNumber('');
    setChildBirthDate('');
    setChildGender('');
    // The list is back: the two numbers and the card under them come to the top.
    window.setTimeout(() => topRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 140);
  };

  // The card folds into the strip, and the strip opens back into the card, as one box changing its height.
  const welcomeView = known ? (pick === null ? 'card' : 'strip') : '';
  useLayoutEffect(() => {
    const box = welcomeRef.current;
    const from = welcomeFromRef.current;
    welcomeFromRef.current = 0;
    if (!box || !from || prefersReducedMotion()) return undefined;
    const to = box.offsetHeight;
    if (!to || from === to) return undefined;
    const clear = () => {
      box.style.height = '';
      box.style.overflow = '';
      box.style.transition = '';
    };
    box.style.height = `${from}px`;
    box.style.overflow = 'hidden';
    box.style.transition = 'height 550ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    void box.offsetHeight;
    box.style.height = `${to}px`;
    const timer = window.setTimeout(clear, 570);
    return () => {
      window.clearTimeout(timer);
      clear();
    };
  }, [welcomeView]);

  /** "I'll fill it in myself": the form opens empty, as for a parent we do not know. */
  const fillByHand = () => {
    identifyRunRef.current += 1;
    // A phone taken from the card goes with the identification: it is typed like the rest.
    manualAwaitsPhoneRef.current = phoneFromCard;
    setPhoneFromCard(false);
    dropIdentification('manual');
    setChildFirstName('');
    setChildGender('');
    focusParentName();
  };

  const openField = (key: string) => setOpenedFields((prev) => new Set(prev).add(key));
  const closeField = (key: string) => setOpenedFields((prev) => {
    const next = new Set(prev);
    next.delete(key);
    return next;
  });
  /** The hidden value of a parent's detail, while it is the card's and not retyped. */
  const parentMask = (field: 'firstName' | 'lastName' | 'email'): string => (identified && known ? known[field] : '');
  const childMask = (field: 'firstName' | 'lastName' | 'idNumber' | 'birthDate'): string =>
    (identified && pickedKid && !childEdited ? pickedKid[field] : '');
  /** The detail is the card's own: nothing to type, nothing to check, and the server completes it. */
  const fromCard = (mask: string, key: string) => Boolean(mask) && !openedFields.has(key);

  /**
   * A detail of the chosen child was typed over. The stored child is never
   * changed from the form, so from here this is a new child: the other hidden
   * details open empty, and `keep` holds what was just typed.
   */
  const turnIntoNewChild = (keep: 'firstName' | 'lastName' | 'idNumber' | 'birthDate' | 'gender') => {
    if (!pickedKid || childEdited) return;
    setChildEdited(true);
    setFillDone(false);
    if (keep !== 'firstName') setChildFirstName('');
    if (keep !== 'gender') setChildGender('');
    setOpenedFields((prev) => new Set([...prev].filter((key) => key.startsWith('parent'))));
  };

  /** The family's children still free to be chosen in an "another child" section. */
  const knownKidsFor = (sectionId: string): KnownChild[] => {
    if (!identified || !known) return [];
    const taken = new Set<string>();
    if (pickedKid && !childEdited) taken.add(pickedKid.id);
    additionalChildren.forEach((child) => {
      if (child.id !== sectionId && child.known) taken.add(child.known.id);
    });
    return known.children.filter((kid) => !taken.has(kid.id));
  };

  // The hidden values type themselves in, field after field.
  const fillSteps: FillStep[] | null = identified && known ? [
    { key: 'parentFirstName', text: fromCard(known.firstName, 'parentFirstName') ? known.firstName : '' },
    { key: 'parentLastName', text: fromCard(known.lastName, 'parentLastName') ? known.lastName : '' },
    { key: 'parentEmail', text: fromCard(known.email, 'parentEmail') ? known.email : '' },
    ...(pickedKid && !childEdited ? [
      { key: 'childFirstName', text: pickedKid.firstName },
      { key: 'childLastName', text: pickedKid.lastName },
      { key: 'childIdNumber', text: pickedKid.idNumber },
      { key: 'childBirthDate', text: pickedKid.birthDate },
    ] : []),
  ].filter((step) => step.text) : null;
  const fillOf = useTypedFill(
    fillSteps,
    String(fillRun),
    (key) => {
      if (key === 'parentLastName') childSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (key === 'childLastName') actionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    () => {
      if (pick === 'new') {
        // Only the parent's details were filled. The child's are typed, starting with the name.
        childSectionRef.current?.querySelector('input')?.focus({ preventScroll: true });
        return;
      }
      setFillDone(true);
      window.setTimeout(() => actionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 280);
    },
  );
  // A chosen child's gender is marked last, when the fields above it are in.
  const genderOnShow = !(identified && pickedKid && !childEdited) || fillDone;

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
    // In a course registration the tick box opens and the parent ticks it. A trial keeps it ticked for them.
    if (isTrial) setTermsConsent(true);
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
    // A child chosen from the family's list: what the card holds is not typed and not checked.
    const held = (field: 'lastName' | 'idNumber' | 'birthDate') =>
      Boolean(child.known?.[field]) && !(child.openedFields ?? []).includes(field);
    const firstErr = nameFieldError(child.firstName);
    const lastErr = held('lastName') ? null : nameFieldError(child.lastName);
    if (firstErr) errors.firstName = firstErr;
    if (lastErr) errors.lastName = lastErr;
    if (!held('idNumber')) {
      const idErr = israeliIdFieldError(child.idNumber);
      if (idErr) errors.idNumber = idErr;
      else if (usedIdNumbers.has(child.idNumber.replace(/\D/g, ''))) {
        errors.idNumber = 'ת.ז. כבר בשימוש לילד אחר בטופס';
      }
    }
    if (!held('birthDate') && !child.birthDate.trim()) errors.birthDate = 'תאריך לידה חובה';
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
      // "Already paid" is said only when no registration in the basket charges the fee and all say so.
      registration_fee_paid_before: responses.every((response) => response.registration_fee_paid_before === true),
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
    return toPaymentResponse(res.data);
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

    let approvedShown = false;
    const showSuccess = () => {
      if (isTrial || !mine() || prefersReducedMotion()) {
        setStep(isTrial ? 'trial_success' : 'payment_success');
        return;
      }
      // No second "approved" message: the last station turns green, and the final screen says the rest.
      approvedShown = true;
      setChargeApproved(true);
      window.setTimeout(() => {
        setChargeApproved(false);
        setChargePhase('charge');
        setStep('payment_success');
      }, APPROVED_SHOW_MS);
    };
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
        // While the green station is on show the panel keeps the wording it had.
        if (!approvedShown) setChargePhase('charge');
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

  /** The parent's part of every registration: typed details, or the token and the details left empty. */
  const parentPayload = (): Record<string, unknown> => ({
    parent_id_number: parentIdNumber,
    parent_first_name: fromCard(parentMask('firstName'), 'parentFirstName') ? '' : parentFirstName,
    parent_last_name: fromCard(parentMask('lastName'), 'parentLastName') ? '' : parentLastName,
    parent_phone: phoneFromCard ? '' : parentPhone,
    parent_email: fromCard(parentMask('email'), 'parentEmail') ? '' : parentEmail,
    // Sent only for a parent the form identified; the server completes what is empty from the card.
    ...(identified && known ? { identify_token: known.token, device_id: deviceId() } : {}),
  });

  /** Every child of the form with its courses, in the order they are registered — and quoted. */
  const registrationPlan = (
    primaryLookup: LookupResult | null,
    extraChildren: AdditionalChildEnrollment[],
  ): PlanChild[] => {
    const confirmed = (found: LookupResult | null | undefined) =>
      (found as (LookupResult & { _confirmed?: boolean }) | null | undefined)?._confirmed ?? false;
    const primaryFromCard = identified && pickedKid && !childEdited;
    return [
      {
        payload: {
          ...(primaryFromCard ? { identified_child_id: pickedKid.id } : {}),
          child_first_name: selfRegistering ? parentFirstName : childFirstName,
          child_last_name: selfRegistering ? parentLastName : childLastName,
          child_id_number: selfRegistering ? parentIdNumber : childIdNumber,
          child_birth_date: childBirthDate,
          child_gender: childGender,
        },
        selections: [primarySelection, ...primaryExtraLessons],
        discountConfirmed: confirmed(primaryLookup),
        startingChildId: primaryLookup?.child_id ?? '',
      },
      ...extraChildren.map((child) => ({
        payload: {
          ...(identified && child.known ? { identified_child_id: child.known.id } : {}),
          child_first_name: child.firstName,
          child_last_name: child.lastName,
          child_id_number: child.idNumber,
          child_birth_date: child.birthDate,
          child_gender: child.gender,
        },
        selections: childLessonSelections(child),
        discountConfirmed: confirmed(child.lookup),
        startingChildId: child.lookup?.child_id ?? '',
      })),
    ];
  };

  /** The identification is no longer good (hours passed, or the office switched it off): go on by hand. */
  const identificationExpired = (message?: string) => {
    lastIdentifyKeyRef.current = `${parentIdNumber}|${parentPhone}`;
    manualAwaitsPhoneRef.current = phoneFromCard;
    setPhoneFromCard(false);
    dropIdentification('manual');
    setAdditionalChildren((prev) => prev.map((child) => (
      child.known ? { ...child, known: null, knownWas: null, firstName: '', gender: '' as const } : child
    )));
    setQuote(null);
    setQuoteState('idle');
    setErrorMsg(message || 'הזיהוי פג. מלאו את הפרטים והמשיכו כרגיל.');
    setStep('details');
  };

  /**
   * The price before the signature. The server runs the registration of this
   * very form and rolls it back, so what is shown is what will be charged.
   * A refusal the parent can act on (a child already in the class) goes back
   * to the details; no quote at all — an older server, a limit, no network —
   * and the form goes on to the approvals as it did before there was one.
   */
  const openSummary = async (primaryLookup: LookupResult | null, extraChildren: AdditionalChildEnrollment[]) => {
    const run = ++quoteRunRef.current;
    setQuote(null);
    setQuoteSettled(false);
    setQuoteState('loading');
    // The question goes out at once, while the details screen takes its moment to leave.
    const request = Promise.resolve().then(() => api.post(
      '/customers/widget/quote/',
      { items: quoteItems(parentPayload(), registrationPlan(primaryLookup, extraChildren)) },
      { timeout: 25_000 },
    ));
    request.catch(() => undefined);
    await new Promise<void>((resolve) => leaveScreenThen(false, resolve));
    if (quoteRunRef.current !== run) return;
    setStep('summary');
    try {
      const res = await request;
      if (quoteRunRef.current !== run) return;
      const items = Array.isArray(res.data?.items) ? res.data.items as Array<Record<string, unknown>> : [];
      if (items.length === 0) throw new Error('empty quote');
      setRegisteredChildCount(1 + extraChildren.length);
      setRegisteredLessonCount(items.length);
      setQuote(mergePaymentResponses(items.map((item) => ({ ...toPaymentResponse(item), payment_id: '' }))));
      setQuoteState('ready');
    } catch (err: unknown) {
      if (quoteRunRef.current !== run) return;
      const response = (err as { response?: { status?: number; data?: { error?: string; index?: number; identification_expired?: boolean } } })?.response;
      if (response?.data?.identification_expired) {
        identificationExpired(response.data.error);
        return;
      }
      if (response?.data?.error && typeof response.data.index === 'number' && (response.status ?? 500) < 500) {
        setQuoteState('idle');
        setErrorMsg(response.data.error);
        setStep('details');
        return;
      }
      setQuoteState('unavailable');
      setStep('consents');
    }
  };

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const errors: Partial<Record<DetailsFieldKey, string>> = {};
    // A detail that is the card's own is not typed and not checked: the server completes it.
    const parentFirstErr = fromCard(parentMask('firstName'), 'parentFirstName') ? null : nameFieldError(parentFirstName);
    const parentLastErr = fromCard(parentMask('lastName'), 'parentLastName') ? null : nameFieldError(parentLastName);
    if (parentFirstErr) errors.parentFirstName = parentFirstErr;
    if (parentLastErr) errors.parentLastName = parentLastErr;
    if (!selfRegistering) {
      const childFirstErr = nameFieldError(childFirstName);
      const childLastErr = fromCard(childMask('lastName'), 'childLastName') ? null : nameFieldError(childLastName);
      if (childFirstErr) errors.childFirstName = childFirstErr;
      if (childLastErr) errors.childLastName = childLastErr;
    }

    const parentIdErr = israeliIdFieldError(parentIdNumber);
    if (parentIdErr) errors.parentIdNumber = parentIdErr;
    if (!selfRegistering && !fromCard(childMask('idNumber'), 'childIdNumber')) {
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

    const parentPhoneErr = phoneFromCard ? null : phoneFieldError(parentPhone);
    if (parentPhoneErr) errors.parentPhone = parentPhoneErr;

    const parentEmailErr = fromCard(parentMask('email'), 'parentEmail') ? null : emailFieldError(parentEmail);
    if (parentEmailErr) errors.parentEmail = parentEmailErr;

    if (!fromCard(childMask('birthDate'), 'childBirthDate') && !childBirthDate.trim()) {
      errors.childBirthDate = 'תאריך לידה חובה';
    }
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
    const primaryFromCard = identified && Boolean(pickedKid) && !childEdited;
    try {
      // A child chosen from the family's list is known to the server by the
      // choice itself, and its last name never reached this browser: no look-up.
      const lookupRequests: Array<Promise<{ id: 'primary' | string; data: LookupResult }>> = primaryFromCard ? [] : [
        api.post('/customers/widget/lookup/', {
          parent_id_number: parentIdNumber,
          // The server says what it knows of a family only to whoever typed the family's own phone.
          parent_phone: parentPhone,
          child_first_name: lookupChildFirstName,
          child_last_name: lookupChildLastName,
          lesson_id: isTrial ? effectiveTrialLessonId : lessonId,
          bundle_id: isTrial ? undefined : bundleId,
        }).then((res) => ({ id: 'primary' as const, data: res.data as LookupResult })),
      ];

      for (const child of nextAdditionalChildren) {
        if (child.known) continue;
        lookupRequests.push(
          api.post('/customers/widget/lookup/', {
            parent_id_number: parentIdNumber,
            parent_phone: parentPhone,
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
        lookup: child.known ? null : (lookupByChildId.get(child.id) ?? child.lookup),
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

      // The "is this a sibling?" question is no longer asked: the summary that
      // comes next shows every discount the family gets, whatever the answer was.
      setDiscountQueue([]);
      setDiscountQueueIndex(0);
      void openSummary(primaryLookup, resolvedAdditional);
    } catch {
      if (isTrial) setStep('consents');
      else void openSummary(null, nextAdditionalChildren);
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
      const before: Step = quoteState === 'ready' ? 'summary' : discountQueue.length > 0 ? 'discount_confirm' : 'details';
      if (isTrial) setStep(before);
      else leaveScreenThen(true, () => setStep(before));
      return;
    }
    if (step === 'summary') {
      quoteRunRef.current += 1;
      leaveScreenThen(true, () => setStep('details'));
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

    const consentState = { healthConsent, termsReadComplete, termsConsent, signed: Boolean(signature) };
    // A course registration names one step at a time — the first that is missing — and
    // that step shakes and comes into view. A trial keeps its list of everything missing.
    const errors: Partial<Record<ConsentFieldKey, string>> = isTrial
      ? everyConsentError(consentState)
      : firstMissingConsent(consentState);

    if (Object.keys(errors).length > 0) {
      setConsentErrors(errors);
      if (isTrial) setErrorMsg('יש להשלים את כל השדות הנדרשים');
      else setConsentMissTick((tick) => tick + 1);
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
      const signedPayload = {
        ...parentPayload(),
        signature,
        // The accepted terms carry the consent (checked above: no submit without them).
        computerized_docs_consent: termsConsent,
        // Kept with the signature, so the office can later see what was ticked.
        terms_consent: termsConsent,
        health_consent: healthConsent,
      };

      // The same plan the quote was priced from, in the same order.
      for (const child of registrationPlan(lookup, additionalChildren)) {
        if (child.selections.length === 0) {
          throw new Error('חסרה בחירת חוג לילד נוסף');
        }
        let resolvedChildId = child.startingChildId;
        for (const [index, selection] of child.selections.entries()) {
          const response = await registerEnrollment({
            ...signedPayload,
            ...child.payload,
            ...selectionFields(selection),
            discount_confirmed: index === 0 ? child.discountConfirmed : Boolean(resolvedChildId),
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
      const data = (err as { response?: { data?: { error?: string; identification_expired?: boolean } } })?.response?.data;
      if (data?.identification_expired) {
        // Nothing was registered: the hidden details are no longer available, so they are typed.
        identificationExpired(data.error);
        return;
      }
      setErrorMsg(data?.error ?? 'אירעה שגיאה. נסה שנית.');
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
    // An identified parent stays identified for the next child of the same sitting.
    known: identified ? known : null,
    phoneFromCard: identified ? phoneFromCard : false,
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
    <div className={look.endActions}>
      {canRegisterAnother ? (
        <button type="button" onClick={handleRegisterAnother} className={look.endMain}>
          רשום ילד נוסף
        </button>
      ) : null}
      <button
        type="button"
        onClick={onComplete}
        className={canRegisterAnother ? look.endSecond : look.endMain}
      >
        {canRegisterAnother ? 'סיום' : 'סגור'}
      </button>
    </div>
  );

  // The terms, read from a modal on the consents form, where reading to the
  // end is required. A free trial's summary asks for no consent and has none.
  const termsModal = showTerms ? (
    <div className={styles.termsOverlay} onClick={() => setShowTerms(false)}>
        <div className={styles.termsModal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.termsHeader}>
            <span className={styles.termsModalTitle}>תקנון ונהלים</span>
            <button type="button" className={styles.termsClose} onClick={() => setShowTerms(false)} aria-label="סגירה">✕</button>
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
    <StepBar
      current={
        step === 'payment' ? 3
          : step === 'consents' || step === 'error' || step === 'submitting' ? 2
            : step === 'summary' ? 1 : 0
      }
    />
  );
  // A new screen is read from its top: the step bar (or, for a trial, the title row) comes into view.
  const firstScreenRef = useRef(true);
  useEffect(() => {
    if (firstScreenRef.current) {
      firstScreenRef.current = false;
      return;
    }
    document.querySelector('[data-screen-top]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);
  const consentsReady = healthConsent && termsReadComplete && termsConsent && Boolean(signature);
  // Everything is approved and signed: the button to send comes into view,
  // once the last step had a moment to turn green.
  useEffect(() => {
    if (!consentsReady || (step !== 'consents' && step !== 'error')) return undefined;
    const timer = window.setTimeout(
      () => consentSubmitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
      320,
    );
    return () => window.clearTimeout(timer);
  }, [consentsReady, step]);

  // A screen arrives from the left on the way forward and from the right on the way back.
  const shownStepRef = useRef(step);
  const cameBackRef = useRef(false);
  if (shownStepRef.current !== step) {
    cameBackRef.current = STEP_ORDER[step] < STEP_ORDER[shownStepRef.current];
    shownStepRef.current = step;
  }
  const screenMotion = isTrial
    ? look.stepIn
    : leaving === 'back'
      ? look.stepOutBack
      : leaving === 'forward'
        ? look.stepOut
        : cameBackRef.current ? look.stepInBack : look.stepIn;

  const header = (
    <>
    {stepBar}
    <div className={styles.header} {...(isTrial ? { 'data-screen-top': '' } : {})}>
      <button
        type="button"
        onClick={goBackOneStep}
        className={styles.backButton}
        aria-label="חזרה לשלב הקודם"
      >
        <ChevronRight size={16} aria-hidden="true" />
        חזרה
      </button>
      <h3 className={styles.title}>{formTitle(isTrial)}</h3>
    </div>
    </>
  );

  // The class the form was opened for, once, under the title — on every details form.
  const lessonCard = (
    <LessonHead name={courseName} line={lessonCardLine(lessonLine, isTrial, trialLessonIds.length)} />
  );

  // When the trial lesson is: the day and the date, and the hours under them —
  // at the head of the trial's summary, and again on the screen that says it is booked.
  const trialChosen = trialOccurrences.find(
    (occ) => occ.date === trialLessonDate
      && (occ.lesson_id ?? effectiveTrialLessonId) === effectiveTrialLessonId,
  );
  const trialWhenNow = trialWhen(trialLessonDate, trialChosen);
  // The lesson as it was chosen, kept for the screen that says it is booked:
  // the date picker's own state is cleared whenever the list of dates loads again.
  if (trialLessonDate) {
    bookedTrialRef.current = { lessonId: effectiveTrialLessonId ?? '', date: trialLessonDate, when: trialWhenNow };
  }
  const whenBlock = (when: { day: string; hours: string }) => (
    <div className={look.trialWhen}>
      <span className={look.trialWhenIcon} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      </span>
      {/* Two short lines at any width. */}
      <span className={look.trialWhenText}>
        <span>{when.day}</span>
        {when.hours ? <span className={look.trialWhenHours} dir="ltr">{when.hours}</span> : null}
      </span>
    </div>
  );
  const trialWhenBlock = whenBlock(trialWhenNow);

  if (step === 'details') {
    // The form as it always was: a trial, an adult signing up, another child of a parent typed in before.
    const classicParentSection = (
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
    );

    // A course registration: the identity number and the phone come first, and the rest opens from them.
    const idLine = idHintError
      ? <p className={`${look.idHint} ${look.idHintError}`}>{idHintError}</p>
      : identifyConfig !== null && !identifyOn
        // Identification is off on the server: nothing will be filled in, so nothing is promised.
        ? (formOpen ? null : <p className={look.idHint}>מתחילים בתעודת זהות ובטלפון.</p>)
        : idStage === 'checking'
          ? <p className={look.idHint}><span className={look.dotSpin} />בודקים אם אתם כבר רשומים אצלנו…</p>
          : idStage === 'near' && nearOffer
            ? (
              <p className={look.idHint}>
                זיהינו במערכת מספר דומה, שמסתיים ב־<b dir="ltr">{nearOffer.lastDigit}</b>.{' '}
                <button type="button" className={look.textButton} onClick={acceptNearPhone}>לחצו כאן לעדכון</button>
              </p>
            )
            : idStage === 'waiting'
              ? <p className={look.idHint}>מתחילים בתעודת זהות ובטלפון. אם אתם כבר רשומים אצלנו, נמלא את שאר הפרטים בשבילכם.</p>
              : null;
    const idFirstParentSection = (
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <span className={styles.sectionTitleLine} />
          <span className={styles.sectionTitleText}>פרטי הורה</span>
          <span className={styles.sectionTitleLine} />
        </div>
        <div ref={topRowRef} className={look.topRow}>
          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>ת.ז. הורה *</label>
              <input type="text" inputMode="numeric" value={parentIdNumber}
                onChange={(e) => {
                  setParentIdNumber(sanitizeIsraeliIdInput(e.target.value));
                  clearFieldError('parentIdNumber');
                }}
                className={fieldInputClass('parentIdNumber')} dir="ltr" maxLength={9} autoComplete="off" />
              {fieldErrors.parentIdNumber ? (
                <p className={styles.fieldError}>{fieldErrors.parentIdNumber}</p>
              ) : null}
            </div>
            <div>
              <label className={styles.label}>טלפון נייד *</label>
              <MaskedField
                mask={phoneFromCard && known ? known.phone : ''}
                open={false}
                onOpen={retypePhone}
                onClose={() => undefined}
                type="tel"
                value={parentPhone}
                onChange={(value) => {
                  setParentPhone(sanitizePhoneInput(value));
                  clearFieldError('parentPhone');
                }}
                className={fieldInputClass('parentPhone')}
                ltr
                inputMode="numeric"
                maxLength={PHONE_DIGITS}
                autoComplete="tel"
              />
              {fieldErrors.parentPhone ? (
                <p className={styles.fieldError}>{fieldErrors.parentPhone}</p>
              ) : null}
            </div>
          </div>
          {idLine}
        </div>

        <Reveal open={idStage === 'known' && known !== null} gap={16}>
          <div ref={welcomeRef} className={look.welcome}>
            {known && pick === null ? (
              <KnownParentCard
                key={`who-${fillRun}`}
                title={
                  addingSibling
                    ? 'את מי רושמים עכשיו?'
                    : known.children.length === 1
                      ? `מצאנו אתכם אצלנו. רושמים את ${known.children[0].firstName}?`
                      : 'מצאנו אתכם אצלנו. את מי רושמים?'
                }
                kids={known.children}
                noticeSent={known.noticeSent && !addingSibling}
                newHint="שעוד לא רשום/ה אצלנו"
                fine="נמלא את הפרטים מההרשמה הקודמת שלכם. הם יוצגו מוסתרים."
                onManual={fillByHand}
                onChoose={chooseChild}
              />
            ) : known ? (
              <KnownStrip
                title={pickedKid && !childEdited ? `מילאנו את הפרטים של ${pickedKid.firstName}` : 'מילאנו את פרטי ההורה'}
                note="הפרטים מוסתרים לשמירה על הפרטיות. לשינוי לוחצים על השדה."
                actionLabel={pickedKid ? 'החלפת ילד/ה' : 'חזרה לבחירה'}
                onAction={pickAgain}
              />
            ) : null}
          </div>
        </Reveal>

        <Reveal open={formOpen} gap={16}>
          <div ref={parentFieldsRef} className={`${styles.grid2} ${look.riseGrid}`}>
            <div>
              <label className={styles.label}>שם פרטי</label>
              <MaskedField
                mask={parentMask('firstName')}
                open={openedFields.has('parentFirstName')}
                onOpen={() => openField('parentFirstName')}
                onClose={() => closeField('parentFirstName')}
                {...fillOf('parentFirstName')}
                value={parentFirstName}
                onChange={(value) => { setParentFirstName(value); clearFieldError('parentFirstName'); }}
                className={fieldInputClass('parentFirstName')}
              />
              {fieldErrors.parentFirstName ? (
                <p className={styles.fieldError}>{fieldErrors.parentFirstName}</p>
              ) : null}
            </div>
            <div>
              <label className={styles.label}>שם משפחה</label>
              <MaskedField
                mask={parentMask('lastName')}
                open={openedFields.has('parentLastName')}
                onOpen={() => openField('parentLastName')}
                onClose={() => closeField('parentLastName')}
                {...fillOf('parentLastName')}
                value={parentLastName}
                onChange={(value) => { setParentLastName(value); clearFieldError('parentLastName'); }}
                className={fieldInputClass('parentLastName')}
              />
              {fieldErrors.parentLastName ? (
                <p className={styles.fieldError}>{fieldErrors.parentLastName}</p>
              ) : null}
            </div>
            <div className={styles.gridFull}>
              <label className={styles.label}>דוא&quot;ל *</label>
              <MaskedField
                mask={parentMask('email')}
                open={openedFields.has('parentEmail')}
                onOpen={() => openField('parentEmail')}
                onClose={() => closeField('parentEmail')}
                {...fillOf('parentEmail')}
                value={parentEmail}
                onChange={(value) => { setParentEmail(value); clearFieldError('parentEmail'); }}
                className={fieldInputClass('parentEmail')}
                ltr
                inputMode="email"
                autoComplete="email"
              />
              {fieldErrors.parentEmail ? (
                <p className={styles.fieldError}>{fieldErrors.parentEmail}</p>
              ) : null}
            </div>
          </div>
        </Reveal>
      </div>
    );

    const restOfForm = (
      <>
        {!selfRegistering && (
          <div ref={childSectionRef} className={`${styles.section} ${styles.fadeIn}`}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionTitleLine} />
              <span className={styles.sectionTitleText}>{addingSibling && !idFirst ? 'פרטי הילד הנוסף' : 'פרטי הילד'}</span>
              <span className={styles.sectionTitleLine} />
            </div>
            {identified && pick === 'new' ? (
              <p className={look.kidNote}>פרטי ההורה כבר אצלנו. נשאר למלא רק את פרטי הילד/ה.</p>
            ) : null}
            {identified && pickedKid && childEdited ? (
              <p className={look.kidNote}>
                שיניתם פרט של {pickedKid.firstName}, אז נרשום ילד/ה חדש/ה. הפרטים של {pickedKid.firstName} נשארים אצלנו כמו שהם.{' '}
                <button type="button" className={look.textButton} onClick={() => chooseChild(pickedKid)}>
                  חזרה ל{pickedKid.firstName}
                </button>
              </p>
            ) : null}
            <div className={`${styles.grid2}${idFirst ? ` ${look.riseGrid}` : ''}`}>
              <div>
                <label className={styles.label}>שם פרטי *</label>
                <MaskedField
                  mask={childMask('firstName')}
                  keepsValue
                  open={openedFields.has('childFirstName')}
                  onOpen={() => openField('childFirstName')}
                  onClose={() => closeField('childFirstName')}
                  {...fillOf('childFirstName')}
                  value={childFirstName}
                  onChange={(value) => {
                    setChildFirstName(value);
                    clearFieldError('childFirstName');
                    if (pickedKid && value !== pickedKid.firstName) turnIntoNewChild('firstName');
                  }}
                  className={fieldInputClass('childFirstName')}
                />
                {fieldErrors.childFirstName ? (
                  <p className={styles.fieldError}>{fieldErrors.childFirstName}</p>
                ) : null}
              </div>
              <div>
                <label className={styles.label}>שם משפחה *</label>
                <MaskedField
                  mask={childMask('lastName')}
                  open={openedFields.has('childLastName')}
                  onOpen={() => openField('childLastName')}
                  onClose={() => closeField('childLastName')}
                  {...fillOf('childLastName')}
                  value={childLastName}
                  onChange={(value) => {
                    setChildLastName(value);
                    clearFieldError('childLastName');
                    if (value) turnIntoNewChild('lastName');
                  }}
                  className={fieldInputClass('childLastName')}
                />
                {fieldErrors.childLastName ? (
                  <p className={styles.fieldError}>{fieldErrors.childLastName}</p>
                ) : null}
              </div>
              <div>
                <label className={styles.label}>ת.ז. ילד *</label>
                <MaskedField
                  mask={childMask('idNumber')}
                  open={openedFields.has('childIdNumber')}
                  onOpen={() => openField('childIdNumber')}
                  onClose={() => closeField('childIdNumber')}
                  {...fillOf('childIdNumber')}
                  value={childIdNumber}
                  onChange={(value) => {
                    setChildIdNumber(sanitizeIsraeliIdInput(value));
                    clearFieldError('childIdNumber');
                    if (value) turnIntoNewChild('idNumber');
                  }}
                  className={fieldInputClass('childIdNumber')}
                  ltr
                  inputMode="numeric"
                />
                {fieldErrors.childIdNumber ? (
                  <p className={styles.fieldError}>{fieldErrors.childIdNumber}</p>
                ) : null}
              </div>
              <div>
                <label className={styles.label}>תאריך לידה *</label>
                <MaskedField
                  mask={childMask('birthDate')}
                  open={openedFields.has('childBirthDate')}
                  onOpen={() => openField('childBirthDate')}
                  onClose={() => closeField('childBirthDate')}
                  {...fillOf('childBirthDate')}
                  type="date"
                  value={childBirthDate}
                  onChange={(value) => {
                    setChildBirthDate(value);
                    clearFieldError('childBirthDate');
                    if (value) turnIntoNewChild('birthDate');
                  }}
                  className={fieldInputClass('childBirthDate')}
                  dateClassName={styles.inputDate}
                />
                {fieldErrors.childBirthDate ? (
                  <p className={styles.fieldError}>{fieldErrors.childBirthDate}</p>
                ) : null}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className={styles.label}>מין *</label>
                <div
                  className={`${styles.genderOptions}${idFirst ? ` ${look.genderRow}` : ''}${
                    fillDone && identified && pickedKid && !childEdited && childGender ? ` ${look.genderFilled}` : ''
                  }`}
                >
                  {(['male', 'female'] as const).map((g) => (
                    <label key={g} className={styles.radioLabel}>
                      <input type="radio" name="gender" value={g}
                        checked={childGender === g && genderOnShow}
                        onChange={() => {
                          setChildGender(g);
                          clearFieldError('childGender');
                          if (pickedKid?.gender && g !== pickedKid.gender) turnIntoNewChild('gender');
                        }}
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
        {canAddExtraLesson && primaryExtraLessons.length > 0 ? (
          <div className={styles.primaryLessons}>
            {/* The class the form was opened for stands at the top of the form. */}
            <label className={styles.label}>חוגים נוספים</label>
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
            knownKids={knownKidsFor(child.id)}
            onChange={(next) => {
              setAdditionalChildren((prev) => prev.map((item) => (item.id === child.id ? next : item)));
            }}
            onRemove={() => {
              setAdditionalChildren((prev) => prev.filter((item) => item.id !== child.id));
            }}
          />
        ))}

        {canAddAnotherChild || canAddExtraLesson ? (
          <div className={look.addRows}>
            {canAddAnotherChild && additionalChildren.length < MAX_ADDITIONAL_CHILDREN ? (
              <button
                type="button"
                className={look.addRow}
                onClick={() => {
                  setPrimaryExtraPickerOpen(false);
                  setReplacingPrimaryExtraIndex(null);
                  setAdditionalChildren((prev) => [
                    ...prev,
                    createEmptyAdditionalChild(`child-${Date.now()}-${prev.length}`),
                  ]);
                }}
              >
                <span className={look.addRowPlus} aria-hidden="true">+</span>
                <span className={look.addRowText}>
                  <b>הוסיפו ילד נוסף</b>
                  <small>אח או אחות, באותה הרשמה</small>
                </span>
              </button>
            ) : null}

            {canAddExtraLesson && primaryExtraLessons.length < MAX_EXTRA_LESSONS && !primaryExtraPickerOpen ? (
              <button
                type="button"
                className={look.addRow}
                onClick={() => {
                  setReplacingPrimaryExtraIndex(null);
                  setPrimaryExtraPickerOpen(true);
                }}
              >
                <span className={look.addRowPlus} aria-hidden="true">+</span>
                <span className={look.addRowText}>
                  <b>חוג נוסף</b>
                  <small>
                    {selfRegistering ? 'לאותו נרשם' : `עבור ${childFirstName.trim() || 'הילד הראשי'}`}
                  </small>
                </span>
              </button>
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

        <div ref={actionsRef} className={styles.formActions}>
          <button
            type="submit"
            className={`${styles.submitButton}${fillDone && identified ? ` ${look.readyButton}` : ''}`}
            disabled={lookingUp}
          >
            {lookingUp ? <span className={styles.spinner} /> : 'המשך'}
          </button>
          <button type="button" className={styles.backPageButton} onClick={onBack} disabled={lookingUp}>
            חזרה לעמוד הקודם
          </button>
        </div>
      </>
    );

    return (
      <form key="details" noValidate onSubmit={handleDetailsSubmit} className={`${styles.form} ${screenMotion}`} dir="rtl">
        {header}

        {lessonCard}

        {addingSibling && !idFirst ? (
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

        {idFirst ? idFirstParentSection : classicParentSection}

        {idFirst ? (
          <Reveal open={formOpen}>
            <div className={styles.form}>{restOfForm}</div>
          </Reveal>
        ) : restOfForm}
      </form>
    );
  }

  if (step === 'summary') {
    const who = (selfRegistering ? parentFirstName : childFirstName).trim();
    const oneRegistration = additionalChildren.length === 0 && primaryExtraLessons.length === 0;
    return (
      <div key="summary" className={`${styles.form} ${screenMotion}`} dir="rtl">
        {header}
        <div>
          <PaymentSummary
            key={`quote-${quoteRunRef.current}`}
            payment={quote}
            title="סיכום ההרשמה"
            priceLabel={oneRegistration ? (who ? `${lessonNameForCard(courseName)} · ${who}` : lessonNameForCard(courseName)) : 'מחיר החוגים'}
            isTrial={false}
            animate={!quoteSettled}
            checkingLabel={selfRegistering ? 'בודקים את הנתונים…' : 'בודקים את נתוני הילד/ה…'}
            onSettled={() => {
              if (quoteSettled) return;
              setQuoteSettled(true);
              // The saving line opens above the button, so the button comes into view after it did.
              window.setTimeout(
                () => summaryActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
                quote && paymentSummaryModel(quote).discountLines.length > 0 ? 650 : 150,
              );
            }}
          />
        </div>
        <div className={styles.formActions}>
          <button
            ref={summaryActionRef}
            type="button"
            className={`${styles.submitButton}${quoteSettled ? ` ${look.readyButton}` : ''}`}
            disabled={!quote}
            onClick={() => leaveScreenThen(false, () => setStep('consents'))}
          >
            המשך לאישורים ולתשלום
          </button>
        </div>
      </div>
    );
  }

  if (step === 'discount_confirm') {
    const currentDiscount = discountQueue[discountQueueIndex];
    const activeLookup = currentDiscount ? getLookupForDiscountTarget(currentDiscount.id) : lookup;
    if (!activeLookup?.discount_question) {
      return null;
    }
    return (
      <div key={`discount-${discountQueueIndex}`} className={`${styles.form} ${screenMotion}`} dir="rtl">
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
    const childName = `${selfRegistering ? parentFirstName : childFirstName} ${selfRegistering ? parentLastName : childLastName}`.trim();
    const parentName = `${parentFirstName} ${parentLastName}`.trim();
    return (
      <form
        key="trial_confirm"
        noValidate
        className={`${styles.form} ${screenMotion}`}
        dir="rtl"
        onSubmit={(e) => {
          e.preventDefault();
          void handleTrialConfirm();
        }}
      >
        {header}

        {/* One card. What the parent came to check — when — stands at its head. */}
        <div className={look.trialCard}>
          {trialWhenBlock}
          <div className={look.trialRow}>
            <span>חוג</span>
            <b>{lessonNameForCard(courseName)}</b>
          </div>
          <div className={look.trialRow}>
            <span>{selfRegistering ? 'משתתף/ת' : 'ילד/ה'}</span>
            <b>{childName || '—'}</b>
          </div>
          {!selfRegistering || !trialLessonIsPaid ? (
            <div className={look.trialFoot}>
              {!selfRegistering ? (
                <span>
                  הורה: {parentName || '—'}
                  {parentPhone ? <>{' · '}<span dir="ltr">{parentPhone}</span></> : null}
                </span>
              ) : <span />}
              {!trialLessonIsPaid ? <span className={look.trialFree}>ללא תשלום</span> : null}
            </div>
          ) : null}
        </div>

        {/* A free trial asks for no consent to the terms: only what is worth knowing. */}
        <TrialInfo paid={trialLessonIsPaid} />

        {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

        <button type="submit" className={styles.submitButton}>
          אישור והרשמה
        </button>
      </form>
    );
  }

  if (step === 'consents' || step === 'error') {
    return (
      <form key="consents" noValidate onSubmit={handleFinalSubmit} className={`${look.consForm} ${screenMotion}`} dir="rtl">
        {header}

        <ConsentSteps
          healthConsent={healthConsent}
          onHealthChange={(checked) => {
            setHealthConsent(checked);
            if (checked) clearConsentError('health');
          }}
          termsReadComplete={termsReadComplete}
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
          missTick={consentMissTick}
          paymentFollows={!isTrial || trialLessonIsPaid}
        />

        {termsModal}

        {/* A trial lesson that goes through the approvals: what is worth knowing, next to the button that approves. */}
        {isTrial ? <TrialInfo paid={trialLessonIsPaid} /> : null}

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

  if (step === 'payment' && paymentData && (charging || chargeApproved)) {
    return (
      <>
        {stepBar}
        <ProcessingPanel
          approved={chargeApproved}
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
    const near = (a: unknown, b: unknown) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) < 0.005;
    // The parent already saw this very price before signing: the payment screen only recalls it.
    const quotedBefore = !isTrial && quoteState === 'ready' && quote !== null;
    const sameAsQuoted = quotedBefore
      && near(quote.final_amount, paymentData.final_amount)
      && near(quote.monthly_amount, paymentData.monthly_amount);
    const paying = paymentSummaryModel(paymentData);

    return (
      <div key="payment" className={`${styles.paymentContainer} ${screenMotion}`} dir="rtl">
        {stepBar}
        {sameAsQuoted ? (
          <h3 className={`${styles.title} ${look.payTitle}`}>
            <span className={look.payShield} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path className={look.payShieldDraw} pathLength={1} d="M12 2.5 4.5 5.3v5.9c0 4.8 3.2 8.8 7.5 10.3 4.3-1.5 7.5-5.5 7.5-10.3V5.3z" />
                <g className={look.payShieldLock}>
                  <rect x="9" y="11" width="6" height="4.5" rx="1" />
                  <path d="M10.2 11V9.6a1.8 1.8 0 0 1 3.6 0V11" />
                </g>
              </svg>
            </span>
            תשלום מאובטח
          </h3>
        ) : (
          <h3 className={styles.title}>{formTitle(isTrial)}</h3>
        )}

        {sameAsQuoted ? (
          <>
            <div className={look.payBox}>
              <div className={look.sumRow}>
                <span>תשלום כעת</span>
                <span className={look.sumRowValue} dir="ltr">{formatShekelShort(paying.payNow)}</span>
              </div>
              {paying.monthly > 0 ? (
                <div className={look.sumRow}>
                  <span>{paying.monthlyFrom ? `תשלום חודשי, ${paying.monthlyFrom}` : 'תשלום חודשי'}</span>
                  <span className={look.sumRowValue} dir="ltr">{formatShekelShort(paying.monthly)}</span>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            {quotedBefore ? (
              <p className={look.kidNote} style={{ margin: 0 }}>הסכום עודכן מאז הסיכום. זה הסכום לתשלום.</p>
            ) : null}
            <div>
              <PaymentSummary
                key={paymentData.payment_id}
                payment={paymentData}
                title={summaryTitle}
                priceLabel={isTrial
                  ? 'שיעור ניסיון'
                  : (registeredChildCount > 1 || registeredLessonCount > 1 ? 'מחיר החוגים' : 'מחיר החוג')}
                isTrial={isTrial}
                animate={playSummary && !quotedBefore}
                checkingLabel=""
                onSettled={() => {
                  if (summaryPlayedRef.current === paymentData.payment_id) return;
                  summaryPlayedRef.current = paymentData.payment_id;
                  // The figures are in place: bring what the parent does next into view.
                  payActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }}
              />
            </div>
          </>
        )}

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
          <p className={look.paySafe}>
            <span className={look.payShield} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path className={look.payShieldDraw} pathLength={1} d="M12 2.5 4.5 5.3v5.9c0 4.8 3.2 8.8 7.5 10.3 4.3-1.5 7.5-5.5 7.5-10.3V5.3z" />
                <g className={look.payShieldLock}>
                  <rect x="9" y="11" width="6" height="4.5" rx="1" />
                  <path d="M10.2 11V9.6a1.8 1.8 0 0 1 3.6 0V11" />
                </g>
              </svg>
            </span>
            פותחים את עמוד התשלום המאובטח…
          </p>
        )}
        </div>
      </div>
    );
  }

  if (step === 'trial_success') {
    return (
      <ResultScreen tone="done" title="נרשמתם לשיעור ניסיון" actions={successActions}>
        <p className={look.doneText}>אישור ותזכורת יישלחו בוואטסאפ.</p>
        {bookedTrialRef.current ? (
          <div className={look.resultCard}>
            {whenBlock(bookedTrialRef.current.when)}
            <p className={look.resultCardLine}>{lessonNameForCard(courseName)}</p>
            {/* The lesson, with where it is and what to bring, into the parent's own calendar. */}
            <TrialCalendarButton lessonId={bookedTrialRef.current.lessonId} date={bookedTrialRef.current.date} />
          </div>
        ) : null}
      </ResultScreen>
    );
  }

  if (step === 'payment_success' && paymentData) {
    return (
      <SuccessSummary
        key="payment_success"
        payment={paymentData}
        text={registeredChildCount > 1
          ? `${registeredChildCount} ילדים בפנים. נתראה בשיעור הראשון!`
          : registeredLessonCount > 1
            ? `${selfRegistering ? parentFirstName : childFirstName} בפנים, ב-${registeredLessonCount} חוגים. נתראה בשיעור הראשון!`
            : `${selfRegistering ? parentFirstName : childFirstName} בפנים. נתראה בשיעור הראשון!`}
      >
        {successActions}
      </SuccessSummary>
    );
  }

  if (step === 'payment_success') {
    return (
      <ResultScreen tone="done" title="ההרשמה הושלמה" actions={successActions}>
        <p className={look.doneText}>
          {registeredChildCount > 1
            ? `${registeredChildCount} ילדים נרשמו בהצלחה.`
            : registeredLessonCount > 1
              ? `${selfRegistering ? parentFirstName : childFirstName} נרשמ/ה ל-${registeredLessonCount} חוגים.`
              : `${selfRegistering ? parentFirstName : childFirstName} נרשמ/ה לחוג ${lessonNameForCard(courseName)}.`}
        </p>
      </ResultScreen>
    );
  }

  if (step === 'payment_pending') {
    return (
      <ResultScreen
        tone="wait"
        busy={pendingChecking}
        title={pendingChecking ? 'בודקים את התשלום' : 'עדיין אין אישור מחברת הסליקה'}
        actions={(
          <div className={look.endActions}>
            {/* Asks the server again. It used to reopen the card form, which on
                this screen is an invitation to pay twice. */}
            <button
              type="button"
              onClick={() => setPendingChecking(true)}
              className={look.endMain}
              disabled={pendingChecking}
            >
              {pendingChecking ? 'בודקים…' : 'בדקו שוב'}
            </button>
            <button type="button" onClick={onComplete} className={look.endSecond}>
              סגור
            </button>
          </div>
        )}
      >
        <p className={look.doneText}>
          {errorMsg || 'הכרטיס כבר נשלח לסליקה. אל תשלמו שוב.'}
        </p>
        {!pendingChecking && (
          <p className={look.resultNote}>
            אל תשלמו שוב. אם ההרשמה לא מופיעה תוך כמה דקות — צרו איתנו קשר ונבדוק מול חברת הסליקה.
          </p>
        )}
      </ResultScreen>
    );
  }

  if (step === 'payment_failed') {
    return (
      <ResultScreen
        tone="stop"
        title="התשלום נכשל"
        actions={(
          <div className={look.endActions}>
            <button
              type="button"
              onClick={() => { setErrorMsg(''); setStep('payment'); }}
              className={look.endMain}
            >
              נסה שנית
            </button>
            <button type="button" onClick={onComplete} className={look.endSecond}>
              סגור
            </button>
          </div>
        )}
      >
        <p className={look.doneText}>{errorMsg || 'אנא נסה שנית או פנה לצוות.'}</p>
      </ResultScreen>
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
    <ResultScreen
      tone="wait"
      title="משהו השתבש בדרך"
      actions={(
        <div className={look.endActions}>
          <button type="button" onClick={() => { setErrorMsg(''); setStep('details'); }} className={look.endMain}>
            חזרה לטופס
          </button>
          <button type="button" onClick={onComplete} className={look.endSecond}>
            סגור
          </button>
        </div>
      )}
    >
      <p className={look.doneText}>
        {errorMsg || 'הפרטים שמילאתם נשמרו בטופס. חזרו אליו ונסו שוב.'}
      </p>
    </ResultScreen>
  );
}
