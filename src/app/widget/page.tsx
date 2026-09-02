'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import api from '@/lib/api';
import CourseRegistrationForm from './CourseRegistrationForm';
import CourseExpandedDetail from './CourseExpandedDetail/index';
import { CourseList } from './CourseList/CourseList';
import type { Branch, Course, CourseBundle, CourseLesson, CourseLessonPriceOption } from './types';
import type { SavedParentDetails } from './CourseRegistrationForm/types';
import { STATIC_CITIES, normalizeExternalLink, hideSeptemberStandingOrderNote } from './page.utils';
import { isCourseVisibleInWidgetCatalog } from './lessonVisibility';
import { AGE_OPTIONS, formatAge, isInstructorsCourse, INSTRUCTORS_TRACK_TITLE } from '@/lib/courseUtils';
import { findWidgetAlternatives, isWidgetSelectionFull, type WidgetAlternative } from './alternativeLessons';
import { sortWidgetCourseTypes } from './courseTypeOrder';
import { WIDGET_MOTION_MS, prefersReducedMotion } from './widgetMotion';
import { preloadInstructorPhotos } from './instructorPhotoPreload';
import { SkeletonCourseList, SkeletonFilterOptions } from './WidgetSkeletons/WidgetSkeletons';
import styles from './page.module.css';

const OPTION_HEIGHT = 44;
const MAX_PANEL_HEIGHT = 240;
const MIN_PANEL_HEIGHT = 132;
const PANEL_GAP = 8;

/** Less than this left to travel and the reader has arrived — the same slack the
    shortcut inside the terms document allows itself. */

const DETAIL_EXIT_MS = WIDGET_MOTION_MS.detailExit;
const DRAWER_EXIT_MS = WIDGET_MOTION_MS.drawerExit;

function panelHeightForOptions(optionCount: number) {
  return Math.min(MAX_PANEL_HEIGHT, Math.max(optionCount, 1) * OPTION_HEIGHT + 8);
}

/**
 * The vertical slice of this document the visitor can actually see, in local
 * coordinates. Embedded in the B2C site the iframe is taller than the phone
 * screen, so only the host page knows the real band — it reports it to us.
 */
// `bottom` leaves room for the host's floating buttons; `edge` is the true visible bottom.
type VisibleBand = { top: number; bottom: number; edge?: number };

let hostBand: VisibleBand | null = null;
const bandSubscribers = new Set<() => void>();
let bandBridgeReady = false;
/** While a fullscreen overlay is open, ignore host band updates (they become 0). */
let bandFrozen = false;

function requestHostBand() {
  try {
    window.parent.postMessage({ type: 'kogo-widget-request-viewport' }, '*');
  } catch {
    /* cross-origin host may still receive the message */
  }
}

function ensureHostBandBridge() {
  if (bandBridgeReady || typeof window === 'undefined') return;
  bandBridgeReady = true;
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; top?: number; bottom?: number; edge?: number } | null;
    if (!data || data.type !== 'kogo-widget-visible-band') return;
    if (bandFrozen) return;
    const top = Number(data.top);
    const bottom = Number(data.bottom);
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom - top < 80) return;
    const edge = Number(data.edge);
    hostBand = { top, bottom, edge: Number.isFinite(edge) && edge > bottom ? edge : bottom };
    bandSubscribers.forEach((notify) => notify());
  });
  requestHostBand();
}

function visibleBand(): VisibleBand {
  if (hostBand) return hostBand;
  const vv = window.visualViewport;
  const top = vv?.offsetTop ?? 0;
  return { top, bottom: top + (vv?.height ?? window.innerHeight) };
}

/** Visible room under the field — the list always opens downward into it. */
function roomBelowField(fieldRect: DOMRect) {
  return visibleBand().bottom - fieldRect.bottom - PANEL_GAP * 2;
}

function isWidgetEmbedded() {
  try {
    return typeof window !== 'undefined' && window.parent !== window;
  } catch {
    return true;
  }
}

function scrollWindowBy(delta: number) {
  if (delta <= 2) return;
  const next = Math.max(0, (window.scrollY || window.pageYOffset || 0) + delta);
  window.scrollTo(0, next);
}

/** Ask the B2C host (and this page) to scroll down until the whole list shows. */
function requestReveal(fieldRect: DOMRect, desiredHeight: number) {
  const wantedBottom = fieldRect.bottom + PANEL_GAP + desiredHeight;
  try {
    window.parent.postMessage(
      { type: 'kogo-widget-dropdown-open', panelBottom: wantedBottom },
      '*',
    );
  } catch {
    /* cross-origin host may still receive the message */
  }
  // Embedded, the host owns scrolling — it answers with a fresh visible band.
  if (isWidgetEmbedded()) return;
  scrollWindowBy(wantedBottom - visibleBand().bottom + 16);
}

function notifyDropdownClosed() {
  try {
    window.parent.postMessage({ type: 'kogo-widget-dropdown-close' }, '*');
  } catch {
    /* cross-origin host may still receive the message */
  }
}

function readScrollY() {
  return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
}

function writeScrollY(y: number) {
  const top = Math.max(0, y);
  const html = document.documentElement;
  const previous = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  window.scrollTo({ top, left: 0, behavior: 'auto' });
  html.scrollTop = top;
  document.body.scrollTop = top;
  html.style.scrollBehavior = previous;
}

/**
 * Freeze the currently visible iframe slice in place. Apply once — re-applying
 * when the host later reports a fullscreen band is what made the list jump.
 *
 * Only a host that reports a band goes on to stretch this frame across the whole
 * screen, and only that resize slides the visible slice out from under the
 * reader. Standing alone, or inside a frame whose host says nothing, the viewport
 * is the same before and after an overlay opens: there is nothing to answer, and
 * moving the page would itself be the jump the reader sees.
 *
 * The frame keeps its scroll position across the host's resize, so that scroll
 * is already where the reader left it.
 *
 * The slide itself is the host's job: it moves this frame by the band's top in
 * the same render that stretches it, so both land in one paint. Doing it here
 * put the two changes in different documents and different frames, and the
 * gap between them was the jump the reader saw.
 */
function pinVisibleSlice(_page: HTMLElement | null) {
  const band = hostBand;
  if (!band) return () => { /* nothing was frozen, so nothing has to be released */ };
  const iframeScroll = readScrollY();
  bandFrozen = true;
  return () => {
    writeScrollY(iframeScroll);
    bandFrozen = false;
  };
}

/** Render modals on document.body so fixed positioning is not affected by page scroll. */
function WidgetPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return ReactDOM.createPortal(children, document.body);
}

const WIDGET_SUPPORT_PHONE = '0509424755';

/** The expanded card a registration was started from — the drawer steps back to it. */
type DrawerOrigin = {
  course: Course;
  bundle: CourseBundle | null;
  lesson: CourseLesson | null;
  priceOption: CourseLessonPriceOption | null;
};

function NoMatchingCoursesMessage() {
  return (
    <p className={styles.emptyMessage}>
      בסניף זה אין חוגים מתאימים לבחירתכם. צריך עזרה? דברו איתנו!{' '}
      <a href={`tel:${WIDGET_SUPPORT_PHONE}`} className={styles.emptyMessagePhone}>
        {WIDGET_SUPPORT_PHONE}
      </a>
    </p>
  );
}

type FilterOption = { value: string; label: string };

const FilterSelect = React.memo(function FilterSelect({
  value,
  onChange,
  disabled,
  loading,
  placeholder,
  selectedLabel,
  options,
  active,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder: string;
  selectedLabel?: string;
  options: FilterOption[];
  active?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [maxHeight, setMaxHeight] = useState(MAX_PANEL_HEIGHT);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [moreToScroll, setMoreToScroll] = useState(false);

  const measureList = useCallback(() => {
    const el = listRef.current;
    setMoreToScroll(!!el && el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);

  // The list only exists once it opens, and its height is settled a tick later
  // by the panel sizing above, so measure after that rather than on mount.
  useLayoutEffect(() => {
    if (!isOpen) return setMoreToScroll(false);
    measureList();
  }, [isOpen, options, maxHeight, measureList]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const openedAtRef = useRef(0);
  const desiredHeight = panelHeightForOptions(options.length);

  /**
   * The list always opens downward. While the page is still scrolling towards
   * it we keep the full height; only if the page truly cannot scroll any
   * further do we shrink the list so it never gets cut off.
   */
  const syncHeight = useCallback(() => {
    const field = wrapperRef.current;
    if (!field) return;
    const room = roomBelowField(field.getBoundingClientRect());
    const settling = Date.now() - openedAtRef.current < 900;
    const next = room >= desiredHeight || settling ? desiredHeight : Math.max(MIN_PANEL_HEIGHT, room);
    setMaxHeight((prev) => (Math.abs(prev - next) < 2 ? prev : next));
  }, [desiredHeight]);

  const openPanel = () => {
    if (disabled || typeof window === 'undefined') return;
    ensureHostBandBridge();
    requestHostBand();
    openedAtRef.current = Date.now();
    setMaxHeight(desiredHeight);
    const field = wrapperRef.current;
    if (field) {
      const rect = field.getBoundingClientRect();
      // Embedded without a band yet we cannot judge the room, so scroll anyway.
      const unknownRoom = isWidgetEmbedded() && !hostBand;
      if (unknownRoom || roomBelowField(rect) < desiredHeight) requestReveal(rect, desiredHeight);
    }
    setIsOpen(true);
  };

  const closePanel = () => {
    setIsOpen(false);
    notifyDropdownClosed();
  };

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    closePanel();
  };

  // The host reports a new visible band on every scroll; standalone we watch
  // scroll/resize ourselves. Either way we re-check the room under the field.
  useEffect(() => {
    if (!isOpen) return;
    syncHeight();
    bandSubscribers.add(syncHeight);
    window.addEventListener('scroll', syncHeight, { passive: true });
    window.addEventListener('resize', syncHeight);
    window.visualViewport?.addEventListener('resize', syncHeight);
    window.visualViewport?.addEventListener('scroll', syncHeight);
    const settle = setTimeout(syncHeight, 950);
    return () => {
      clearTimeout(settle);
      bandSubscribers.delete(syncHeight);
      window.removeEventListener('scroll', syncHeight);
      window.removeEventListener('resize', syncHeight);
      window.visualViewport?.removeEventListener('resize', syncHeight);
      window.visualViewport?.removeEventListener('scroll', syncHeight);
    };
  }, [isOpen, syncHeight]);

  const chevronIcon = isOpen ? (
    <ChevronUp size={16} className={styles.filterChevron} />
  ) : value ? (
    <span className={styles.filterCheckBadge}>
      <Check size={13} className={styles.filterCheckIcon} />
    </span>
  ) : (
    <ChevronDown size={16} className={styles.filterChevron} />
  );

  const panel = isOpen ? (
    <div className={styles.dropdownShell} onClick={(e) => e.stopPropagation()}>
      <ul
        ref={listRef}
        role="listbox"
        aria-label={placeholder}
        className={styles.dropdownPanel}
        style={{ '--dp-max-height': `${maxHeight}px` } as React.CSSProperties}
        onScroll={measureList}
      >
        {loading ? (
          /* The field itself never changes shape while it waits — swapping it for
             a grey block moved the whole strip. The wait belongs here, where
             someone has actually gone looking for the options. */
          <li className={styles.dropdownLoading}>
            <SkeletonFilterOptions />
          </li>
        ) : options.length === 0 ? (
          <li className={styles.dropdownEmpty}>אין אפשרויות</li>
        ) : options.map((opt) => (
          <li key={opt.value} role="option" aria-selected={opt.value === value} className={`${styles.dropdownOption} ${opt.value === value ? styles.dropdownOptionSelected : ''}`} onClick={() => handleSelect(opt.value)}>
            {opt.label}
          </li>
        ))}
      </ul>
      {/* Only while the list runs past its own bottom edge, and gone once it has
          been read to the end — a cue that never leaves is not a cue. */}
      {moreToScroll ? (
        <span className={styles.dropdownCue} aria-hidden="true">
          <ChevronDown size={12} />
        </span>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      {isOpen && typeof document !== 'undefined'
        ? ReactDOM.createPortal(<div className={styles.dropdownBackdrop} onClick={closePanel} />, document.body)
        : null}
      <div
        ref={wrapperRef}
        className={`${styles.filterWrapper} ${active ? styles.filterWrapperActive : ''} ${isOpen ? styles.filterWrapperOpen : ''}`}
        onClick={openPanel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') return closePanel();
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            isOpen ? closePanel() : openPanel();
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className={styles.filterFace}>
          <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={styles.filterSelect}>
            <option value="">{placeholder}</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span className={styles.filterDisplayText}>{value && selectedLabel ? selectedLabel : placeholder}</span>
          <div className={styles.filterIconBox}>{chevronIcon}</div>
        </div>
        {typeof document !== 'undefined' && panel ? panel : null}
      </div>
    </>
  );
});

export default function WidgetPage() {
  const cities = STATIC_CITIES;
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [coursesByBranch, setCoursesByBranch] = useState<Record<string, Course[]>>({});
  const [courseTypesByBranch, setCourseTypesByBranch] = useState<Record<string, { id: string; name: string }[]>>({});

  const [selectedCity, setSelectedCity] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedCourseType, setSelectedCourseType] = useState('');
  const [selectedAge, setSelectedAge] = useState('');

  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingCourseTypes, setLoadingCourseTypes] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const loadedBranchCoursesRef = useRef(new Set<string>());
  const loadedCourseTypesRef = useRef(new Set<string>());
  const [detailCourse, setDetailCourse] = useState<Course | null>(null);
  const [detailBundle, setDetailBundle] = useState<CourseBundle | null>(null);
  const [detailLesson, setDetailLesson] = useState<CourseLesson | null>(null);
  const [detailPriceOption, setDetailPriceOption] = useState<CourseLessonPriceOption | null>(null);
  const [drawerCourse, setDrawerCourse] = useState<Course | null>(null);
  const [drawerBundle, setDrawerBundle] = useState<CourseBundle | null>(null);
  const [drawerLesson, setDrawerLesson] = useState<CourseLesson | null>(null);
  const [drawerPriceOption, setDrawerPriceOption] = useState<CourseLessonPriceOption | null>(null);
  const [drawerIsTrial, setDrawerIsTrial] = useState(false);
  const [drawerOrigin, setDrawerOrigin] = useState<DrawerOrigin | null>(null);
  const [detailClosing, setDetailClosing] = useState(false);
  // The slice of this frame the host says is on screen, under its header and
  // above its floating buttons. Overlays are framed by it so nothing opens
  // behind the host's header. Standalone there is no host, and no frame.
  const [band, setBand] = useState<VisibleBand | null>(() => hostBand);
  useEffect(() => {
    const sync = () => setBand(hostBand ? { ...hostBand } : null);
    bandSubscribers.add(sync);
    sync();
    return () => {
      bandSubscribers.delete(sync);
    };
  }, []);
  const bandHeight = band ? (band.edge ?? band.bottom) - band.top : null;

  const bandFrame = band
    ? {
        position: 'fixed' as const,
        top: band.top,
        left: 0,
        right: 0,
        height: bandHeight ?? undefined,
        // A transform makes this the containing block of the fixed overlays inside it.
        transform: 'translateZ(0)',
        zIndex: 1000,
      }
    : undefined;
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [savedParent, setSavedParent] = useState<SavedParentDetails | null>(null);
  const [addingAnotherChild, setAddingAnotherChild] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const detailExitRef = useRef<number | null>(null);
  const drawerExitRef = useRef<number | null>(null);

  const clearDetail = () => {
    setDetailCourse(null);
    setDetailBundle(null);
    setDetailLesson(null);
    setDetailPriceOption(null);
  };

  /**
   * An overlay leaves the DOM only once its exit animation has played — dropping
   * the state on the click is what made it blink out. Reduced motion has no
   * animation to wait for, so it unmounts straight away.
   */
  const closeDetail = () => {
    // A second close before the first has played out would otherwise leave a
    // timer that fires over whatever the reader has opened since.
    if (detailExitRef.current) window.clearTimeout(detailExitRef.current);
    if (prefersReducedMotion()) {
      clearDetail();
      return;
    }
    setDetailClosing(true);
    detailExitRef.current = window.setTimeout(() => {
      setDetailClosing(false);
      clearDetail();
    }, DETAIL_EXIT_MS);
  };

  const dismissDrawer = (origin: DrawerOrigin | null) => {
    if (drawerExitRef.current) window.clearTimeout(drawerExitRef.current);
    const finish = () => {
      setDrawerCourse(null);
      setDrawerBundle(null);
      setDrawerLesson(null);
      setDrawerPriceOption(null);
      setDrawerIsTrial(false);
      setDrawerOrigin(null);
      if (!origin) return;
      // The card that opened this drawer may still be seeing itself out. Stop
      // that timer before reopening it, or it lands on the restored card.
      if (detailExitRef.current) window.clearTimeout(detailExitRef.current);
      setDetailClosing(false);
      setDetailCourse(origin.course);
      setDetailBundle(origin.bundle);
      setDetailLesson(origin.lesson);
      setDetailPriceOption(origin.priceOption);
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    setDrawerClosing(true);
    drawerExitRef.current = window.setTimeout(() => {
      setDrawerClosing(false);
      finish();
    }, DRAWER_EXIT_MS);
  };

  useEffect(() => () => {
    if (detailExitRef.current) window.clearTimeout(detailExitRef.current);
    if (drawerExitRef.current) window.clearTimeout(drawerExitRef.current);
  }, []);

  const toggleDetail = (
    course: Course,
    bundle?: CourseBundle,
    lesson?: CourseLesson,
    priceOption?: CourseLessonPriceOption,
  ) => {
    const isSame =
      detailCourse?.id === course.id &&
      detailBundle?.id === bundle?.id &&
      detailLesson?.id === lesson?.id &&
      detailPriceOption?.id === priceOption?.id;
    if (isSame) {
      closeDetail();
      return;
    }
    setDetailCourse(course);
    setDetailBundle(bundle ?? null);
    setDetailLesson(lesson ?? null);
    setDetailPriceOption(priceOption ?? null);
  };

  const detailBundleForLesson = detailCourse && detailLesson
    ? detailCourse.bundles?.find((b) => b.lessons.some((l) => l.id === detailLesson.id)) ?? null
    : null;

  const branchCourses = selectedBranch ? (coursesByBranch[selectedBranch] ?? []) : [];

  const filteredBranches = useMemo(() => {
    if (!selectedCity) return [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    return allBranches.filter((b) => {
      if (b.city !== selectedCity) return false;
      const nameKey = b.name.trim();
      if (seenIds.has(b.id) || seenNames.has(nameKey)) return false;
      seenIds.add(b.id);
      seenNames.add(nameKey);
      return true;
    });
  }, [allBranches, selectedCity]);

  const courseTypes = selectedBranch ? (courseTypesByBranch[selectedBranch] ?? []) : [];

  const filteredCourses = useMemo(() => branchCourses.filter((course) => {
    if (selectedCourseType && String(course.course_type) !== selectedCourseType) return false;
    if (selectedAge) {
      const age = parseInt(selectedAge, 10);
      const minAge = course.min_age ?? 0;
      const maxAge = course.max_age ?? 99;
      const courseMatches = age >= minAge && age <= maxAge;
      const optionMatches = (course.lessons ?? []).some((lesson) =>
        (lesson.price_options ?? []).some((option) => {
          if (option.min_age == null && option.max_age == null) return false;
          return age >= (option.min_age ?? 0) && age <= (option.max_age ?? 99);
        }),
      );
      if (!courseMatches && !optionMatches) return false;
    }
    return isCourseVisibleInWidgetCatalog(course);
  }), [branchCourses, selectedCourseType, selectedAge]);

  const catalogDefaultFilters = useMemo(
    () => ({
      city: selectedCity,
      branch: selectedBranch,
      courseType: selectedCourseType,
      age: selectedAge,
    }),
    [selectedCity, selectedBranch, selectedCourseType, selectedAge],
  );

  const cityOptions = useMemo(
    () => cities.map((c) => ({ value: c.id, label: c.name })),
    [cities],
  );
  const branchOptions = useMemo(
    () => filteredBranches.map((b) => ({ value: b.id, label: b.name })),
    [filteredBranches],
  );
  const courseTypeOptions = useMemo(
    () => courseTypes.map((t) => ({ value: t.id, label: t.name })),
    [courseTypes],
  );
  const ageOptions = useMemo(
    () => AGE_OPTIONS.map((age) => ({ value: String(age), label: formatAge(age) })),
    [],
  );

  useEffect(() => {
    setLoadingBranches(true);
    api.get('/customers/widget/branches/')
      .then((branchesRes) => {
        const branchesData: Branch[] = Array.isArray(branchesRes.data) ? branchesRes.data : branchesRes.data.results ?? [];
        setAllBranches(branchesData);
        const typeMap: Record<string, { id: string; name: string }[]> = {};
        for (const branch of branchesData) {
          if (!branch.course_types?.length) continue;
          typeMap[branch.id] = sortWidgetCourseTypes(branch.course_types);
          loadedCourseTypesRef.current.add(branch.id);
        }
        if (Object.keys(typeMap).length) setCourseTypesByBranch(typeMap);
      })
      .finally(() => setLoadingBranches(false));
  }, []);

  useEffect(() => {
    if (!selectedBranch || loadedCourseTypesRef.current.has(selectedBranch)) return;

    let cancelled = false;
    setLoadingCourseTypes(true);
    api.get(`/customers/widget/course-types/?branch_id=${selectedBranch}`)
      .then((res) => {
        if (cancelled) return;
        const types = Array.isArray(res.data) ? res.data as { id: string; name: string }[] : [];
        loadedCourseTypesRef.current.add(selectedBranch);
        setCourseTypesByBranch((prev) => ({ ...prev, [selectedBranch]: sortWidgetCourseTypes(types) }));
      })
      .catch(() => {
        if (!cancelled) {
          loadedCourseTypesRef.current.add(selectedBranch);
          setCourseTypesByBranch((prev) => ({ ...prev, [selectedBranch]: [] }));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCourseTypes(false);
      });

    return () => { cancelled = true; };
  }, [selectedBranch]);

  useEffect(() => {
    if (!selectedBranch || loadedBranchCoursesRef.current.has(selectedBranch)) return;

    let cancelled = false;
    setLoadingCourses(true);
    api.get(`/customers/widget/courses/?branch_id=${selectedBranch}`)
      .then((res) => {
        if (cancelled) return;
        const courses = Array.isArray(res.data) ? res.data : (res.data.results ?? []) as Course[];
        preloadInstructorPhotos(courses);
        loadedBranchCoursesRef.current.add(selectedBranch);
        setCoursesByBranch((prev) => ({ ...prev, [selectedBranch]: courses }));
      })
      .catch(() => {
        if (!cancelled) {
          loadedBranchCoursesRef.current.add(selectedBranch);
          setCoursesByBranch((prev) => ({ ...prev, [selectedBranch]: [] }));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCourses(false);
      });

    return () => { cancelled = true; };
  }, [selectedBranch]);

  useEffect(() => {
    if (!selectedCity) return;
    const cityBranches = allBranches.filter((b) => b.city === selectedCity);
    const uniqueNames = new Set(cityBranches.map((b) => b.name.trim()));
    if (uniqueNames.size === 1 && cityBranches[0]) {
      setSelectedBranch(cityBranches[0].id);
    }
  }, [selectedCity, allBranches]);


  // Learn the visible slice of this iframe from the host as early as possible.
  useEffect(() => {
    ensureHostBandBridge();
  }, []);

  useLayoutEffect(() => {
    if (detailCourse || drawerCourse) {
      const unpin = pinVisibleSlice(pageRef.current);
      window.parent.postMessage({ type: 'kogo-widget-expand' }, '*');
      if (drawerCourse) {
        window.parent.postMessage({ type: 'kogo-widget-register-open' }, '*');
      }
      return () => {
        unpin();
        if (drawerCourse) {
          window.parent.postMessage({ type: 'kogo-widget-register-close' }, '*');
        }
      };
    }
    const frame = requestAnimationFrame(() => {
      window.parent.postMessage({ type: 'kogo-widget-collapse' }, '*');
    });
    return () => cancelAnimationFrame(frame);
  }, [detailCourse, drawerCourse]);

  const handleEnrollClick = (isTrial = false, bundleOverride?: CourseBundle | null) => {
    const branch = allBranches.find((b) => b.id === selectedBranch);
    const externalLink = detailCourse?.external_link || branch?.external_link;
    if (branch?.is_external && externalLink) {
      window.open(normalizeExternalLink(externalLink), '_blank', 'noopener,noreferrer');
      closeDetail();
      return;
    }
    setDrawerCourse(detailCourse);
    setDrawerBundle(bundleOverride ?? detailBundle ?? null);
    setDrawerLesson(detailLesson);
    setDrawerPriceOption(detailPriceOption);
    setDrawerIsTrial(isTrial);
    // Remember the card as the parent left it, so back reopens the same one.
    setDrawerOrigin(
      detailCourse
        ? {
          course: detailCourse,
          bundle: detailBundle,
          lesson: detailLesson,
          priceOption: detailPriceOption,
        }
        : null,
    );
    // Every value the drawer needs is already read above, so the card can take
    // its leave the same way it does everywhere else rather than blinking out
    // from under the thumb that pressed it.
    closeDetail();
  };

  const handleTrialEnrollClick = () => handleEnrollClick(true);
  const handleBundleEnrollClick = () => {
    if (detailBundleForLesson) handleEnrollClick(false, detailBundleForLesson);
  };

  const activeDetailBundle = detailBundle ?? detailBundleForLesson;
  const detailSelectionFull = detailCourse
    ? isWidgetSelectionFull(detailCourse, detailLesson, activeDetailBundle)
    : false;
  const detailAlternatives = detailCourse && detailSelectionFull && selectedCourseType
    ? findWidgetAlternatives(branchCourses, {
      courseTypeId: selectedCourseType,
      selectedAge: selectedAge ? parseInt(selectedAge, 10) : null,
      currentCourseId: detailCourse.id,
      currentLessonId: detailLesson?.id,
      currentBundleId: activeDetailBundle?.id,
    })
    : [];

  const handleSelectAlternative = (alt: WidgetAlternative) => {
    setDetailCourse(alt.course);
    setDetailLesson(alt.lesson ?? null);
    setDetailBundle(alt.bundle ?? null);
    setDetailPriceOption(null);
  };

  const closeDrawer = () => dismissDrawer(null);

  /** Back out of the first drawer step — the expanded card is the step before it. */
  const backToCourseDetail = () => dismissDrawer(drawerOrigin);

  const finishFamilyRegistration = () => {
    closeDrawer();
    setAddingAnotherChild(false);
    setSavedParent(null);
  };

  const handleRegisterAnother = (parent: SavedParentDetails) => {
    setSavedParent(parent);
    setAddingAnotherChild(true);
    closeDrawer();
  };

  const handleCityChange = useCallback((cityId: string) => {
    setSelectedCity(cityId);
    setSelectedBranch('');
    setSelectedCourseType('');
    setSelectedAge('');
  }, []);
  const handleBranchChange = useCallback((branchId: string) => {
    setSelectedBranch(branchId);
    setSelectedCourseType('');
    setSelectedAge('');
  }, []);
  const handleCourseTypeChange = useCallback((typeId: string) => {
    setSelectedCourseType(typeId);
    setSelectedAge('');
  }, []);

  const showTable = Boolean(selectedCity && selectedBranch && selectedCourseType && selectedAge);

  const showNoMatchingCoursesMessage =
    Boolean(selectedBranch) &&
    !loadingBranches &&
    !loadingCourseTypes &&
    !loadingCourses &&
    (courseTypes.length === 0 || (showTable && filteredCourses.length === 0));

  const showCourseListLoading = showTable && loadingCourses && branchCourses.length === 0;

  const activeField = !selectedCity ? 'city'
    : !selectedBranch ? 'branch'
      : !selectedCourseType ? 'courseType'
        : !selectedAge ? 'age'
          : null;

  // A quiet cue at the edge of what is on screen, only while actual lesson
  // rows (an opened track) sit below it. Collapsed track headers do not count.
  const courseListRef = useRef<HTMLDivElement | null>(null);
  const [rowsBelowFold, setRowsBelowFold] = useState(false);
  const visibleBottomInFrame = () =>
    band ? band.bottom : (window.scrollY || window.pageYOffset || 0) + window.innerHeight;
  const lastRowBottomBelow = () => {
    const el = courseListRef.current;
    if (!el) return null;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const limit = visibleBottomInFrame() - 8;
    let last: number | null = null;
    el.querySelectorAll('[role="listitem"]').forEach((row) => {
      const rect = row.getBoundingClientRect();
      if (rect.top + scrollY >= limit) last = rect.bottom + scrollY;
    });
    return last;
  };
  useEffect(() => {
    const check = () => setRowsBelowFold(lastRowBottomBelow() !== null);
    check();
    const observer = courseListRef.current ? new ResizeObserver(check) : null;
    if (observer && courseListRef.current) observer.observe(courseListRef.current);
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [band, filteredCourses]);
  const revealListEnd = () => {
    const bottom = lastRowBottomBelow();
    if (bottom === null) return;
    if (isWidgetEmbedded()) {
      try {
        window.parent.postMessage({ type: 'kogo-widget-reveal', bottom: bottom + 16 }, '*');
      } catch {
        /* cross-origin host may still receive the message */
      }
      return;
    }
    window.scrollTo({ top: Math.max(0, bottom - window.innerHeight + 16), behavior: 'smooth' });
  };

  return (
    <div ref={pageRef} dir="rtl" className={styles.page}>
      {/* Filter strip */}
      <div className={styles.filterStrip}>
        <h1 className={styles.filterStripTitle}>הרשמה לחוגים / שיעור נסיון</h1>
        <div className={styles.filterStripDivider}>
          <span className={styles.filterStripLine} />
          <span className={styles.filterStripLabel}>חיפוש חוגים</span>
          <span className={styles.filterStripLine} />
        </div>

        <FilterSelect value={selectedCity} onChange={handleCityChange} placeholder="בחרו עיר" options={cityOptions} selectedLabel={cities.find((c) => c.id === selectedCity)?.name} active={activeField === 'city'} />

        <FilterSelect value={selectedBranch} onChange={handleBranchChange} disabled={!selectedCity} loading={loadingBranches} placeholder="בחרו סניף" options={branchOptions} selectedLabel={filteredBranches.find((b) => b.id === selectedBranch)?.name} active={activeField === 'branch'} />

        <FilterSelect value={selectedCourseType} onChange={handleCourseTypeChange} disabled={!selectedBranch} loading={loadingCourseTypes && courseTypes.length === 0} placeholder="בחרו חוג" options={courseTypeOptions} selectedLabel={courseTypes.find((t) => t.id === selectedCourseType)?.name} active={activeField === 'courseType'} />

        <FilterSelect value={selectedAge} onChange={setSelectedAge} disabled={!selectedCourseType} placeholder="בחרו גיל" options={ageOptions} selectedLabel={selectedAge ? formatAge(parseInt(selectedAge)) : undefined} active={activeField === 'age'} />
      </div>

      {addingAnotherChild ? (
        <div className={styles.siblingBanner} role="status">
          <p className={styles.siblingBannerText}>
            בחרו חוג לילד הנוסף. פרטי ההורה יישמרו אוטומטית.
          </p>
          <button
            type="button"
            className={styles.siblingBannerCancel}
            onClick={() => {
              setAddingAnotherChild(false);
              setSavedParent(null);
            }}
          >
            ביטול
          </button>
        </div>
      ) : null}

      {/* Course list */}
      {showNoMatchingCoursesMessage ? (
        <NoMatchingCoursesMessage />
      ) : showCourseListLoading ? (
        <SkeletonCourseList />
      ) : showTable ? (
        <div ref={courseListRef}>
          <CourseList
            filteredCourses={filteredCourses}
            selectedAge={selectedAge ? parseInt(selectedAge, 10) : null}
            onSelect={toggleDetail}
          />
        </div>
      ) : null}

      {rowsBelowFold && !detailCourse && !drawerCourse ? (
        <button
          type="button"
          className={styles.scrollCue}
          style={band ? { top: band.bottom - 40 } : undefined}
          onClick={revealListEnd}
          aria-label="לרשימת השיעורים המלאה"
          title="עוד שיעורים למטה"
        >
          <ChevronDown size={16} aria-hidden />
        </button>
      ) : null}

      {/* An overlay covers the page, so there is nothing left below its own fold to point at. */}

      {/* Course detail overlay — portaled so mobile fixed layout stays viewport-aligned */}
      {detailCourse && (
        <WidgetPortal>
          <div style={bandFrame}>
            <div className={`${styles.detailOverlay}${detailClosing ? ` ${styles.detailOverlayClosing}` : ''}`} onClick={closeDetail} />
            <div
              className={`${styles.detailPanel}${detailClosing ? ` ${styles.detailPanelClosing}` : ''}`}
              style={bandHeight ? { maxHeight: bandHeight } : undefined}
            >
              <CourseExpandedDetail
                course={detailCourse}
                lesson={detailLesson ?? undefined}
                bundleOffer={detailBundle ?? undefined}
                priceOption={detailPriceOption ?? undefined}
                selectionFull={detailSelectionFull}
                alternatives={detailAlternatives}
                onSelectAlternative={handleSelectAlternative}
                hideSeptemberStandingOrderNote={hideSeptemberStandingOrderNote(
                  cities.find((c) => c.id === selectedCity)?.name,
                  allBranches.find((b) => b.id === selectedBranch)?.name
                    ?? detailCourse.branch_name,
                )}
                onClose={closeDetail}
                onEnroll={() => handleEnrollClick(false)}
                onBundleEnroll={detailBundleForLesson ? handleBundleEnrollClick : undefined}
                onTrialEnroll={handleTrialEnrollClick}
              />
            </div>
          </div>
        </WidgetPortal>
      )}

      {/* Enrollment side drawer */}
      {drawerCourse && (
        <WidgetPortal>
          <div style={bandFrame}>
            <div className={`${styles.drawerOverlay}${drawerClosing ? ` ${styles.drawerOverlayClosing}` : ''}`} onClick={closeDrawer} />
            <div className={`${styles.drawerPanel}${drawerClosing ? ` ${styles.drawerPanelClosing}` : ''}`}>
              {allBranches.find((b) => b.id === selectedBranch)?.is_external ? (
                <div className={styles.externalBranchMessage}>
                  {(() => {
                    const branch = allBranches.find((b) => b.id === selectedBranch);
                    const externalLink = drawerCourse?.external_link || branch?.external_link;
                    return externalLink ? (
                      <a href={normalizeExternalLink(externalLink)} target="_blank" rel="noopener noreferrer" className={styles.externalBranchText}>
                        לחצו כאן להמשך רישום בסניף
                      </a>
                    ) : (
                      <p className={styles.externalBranchText}>לחצו כאן להמשך רישום בסניף</p>
                    );
                  })()}
                </div>
              ) : (
                <CourseRegistrationForm
                  courseId={drawerCourse.id}
                  courseName={
                    drawerPriceOption
                      ? drawerPriceOption.display_title
                      : drawerBundle
                        ? `${drawerCourse.name} #${drawerCourse.display_id} (${drawerBundle.name || (isInstructorsCourse(drawerCourse) ? INSTRUCTORS_TRACK_TITLE : 'פעמיים בשבוע')})`
                        : `${drawerCourse.name} #${drawerCourse.display_id}`
                  }
                  isAdult={drawerCourse.is_adult ?? false}
                  bundleId={drawerBundle?.id}
                  lessonId={drawerLesson?.id}
                  priceOptionId={drawerPriceOption?.id}
                  trialLessonOptions={drawerLesson ? [] : (drawerBundle?.lessons ?? [])}
                  isTrial={drawerIsTrial}
                  trialLessonIsPaid={drawerCourse.trial_lesson_is_paid ?? false}
                  trialLessonPrice={
                    drawerCourse.trial_lesson_price != null
                      ? Number(drawerCourse.trial_lesson_price)
                      : null
                  }
                  catalogDefaultFilters={catalogDefaultFilters}
                  initialParent={addingAnotherChild ? savedParent : null}
                  onBack={backToCourseDetail}
                  onComplete={finishFamilyRegistration}
                  onRegisterAnother={handleRegisterAnother}
                />
              )}
            </div>
          </div>
        </WidgetPortal>
      )}
    </div>
  );
}
