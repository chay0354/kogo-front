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
import { STATIC_CITIES, normalizeExternalLink } from './page.utils';
import { isCourseVisibleInWidgetCatalog } from './lessonVisibility';
import { AGE_OPTIONS, formatAge } from '@/lib/courseUtils';
import { findWidgetAlternatives, isWidgetSelectionFull, type WidgetAlternative } from './alternativeLessons';
import styles from './page.module.css';

const OPTION_HEIGHT = 44;
const MAX_PANEL_HEIGHT = 240;
const MIN_PANEL_HEIGHT = 132;
const PANEL_GAP = 8;

function panelHeightForOptions(optionCount: number) {
  return Math.min(MAX_PANEL_HEIGHT, Math.max(optionCount, 1) * OPTION_HEIGHT + 8);
}

/**
 * The vertical slice of this document the visitor can actually see, in local
 * coordinates. Embedded in the B2C site the iframe is taller than the phone
 * screen, so only the host page knows the real band — it reports it to us.
 */
type VisibleBand = { top: number; bottom: number };

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
    const data = event.data as { type?: string; top?: number; bottom?: number } | null;
    if (!data || data.type !== 'kogo-widget-visible-band') return;
    if (bandFrozen) return;
    const top = Number(data.top);
    const bottom = Number(data.bottom);
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom - top < 80) return;
    hostBand = { top, bottom };
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
 */
function pinVisibleSlice(page: HTMLElement | null) {
  const iframeScroll = readScrollY();
  const shift = Math.max(0, iframeScroll + visibleBand().top);
  bandFrozen = true;
  if (page && shift) page.style.transform = `translateY(-${shift}px)`;
  return () => {
    if (page) page.style.transform = '';
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
    if (disabled || loading || typeof window === 'undefined') return;
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

  const chevronIcon = loading ? (
    <svg className={styles.filterSpinner} width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  ) : isOpen ? (
    <ChevronUp size={16} className={styles.filterChevron} />
  ) : value ? (
    <span className={styles.filterCheckBadge}>
      <Check size={13} className={styles.filterCheckIcon} />
    </span>
  ) : (
    <ChevronDown size={16} className={styles.filterChevron} />
  );

  const panel = isOpen ? (
    <ul
      role="listbox"
      aria-label={placeholder}
      className={styles.dropdownPanel}
      style={{ '--dp-max-height': `${maxHeight}px` } as React.CSSProperties}
      onClick={(e) => e.stopPropagation()}
    >
      {options.length === 0 ? (
        <li className={styles.dropdownEmpty}>אין אפשרויות</li>
      ) : options.map((opt) => (
        <li key={opt.value} role="option" aria-selected={opt.value === value} className={`${styles.dropdownOption} ${opt.value === value ? styles.dropdownOptionSelected : ''}`} onClick={() => handleSelect(opt.value)}>
          {opt.label}
        </li>
      ))}
    </ul>
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
        tabIndex={disabled || loading ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className={styles.filterFace}>
          <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || loading} className={styles.filterSelect}>
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
  const [savedParent, setSavedParent] = useState<SavedParentDetails | null>(null);
  const [addingAnotherChild, setAddingAnotherChild] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

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
    setDetailCourse(isSame ? null : course);
    setDetailBundle(isSame ? null : (bundle ?? null));
    setDetailLesson(isSame ? null : (lesson ?? null));
    setDetailPriceOption(isSame ? null : (priceOption ?? null));
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
          typeMap[branch.id] = branch.course_types;
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
        setCourseTypesByBranch((prev) => ({ ...prev, [selectedBranch]: types }));
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
      setDetailCourse(null);
      setDetailBundle(null);
      setDetailLesson(null);
      setDetailPriceOption(null);
      return;
    }
    setDrawerCourse(detailCourse);
    setDrawerBundle(bundleOverride ?? detailBundle ?? null);
    setDrawerLesson(detailLesson);
    setDrawerPriceOption(detailPriceOption);
    setDrawerIsTrial(isTrial);
    setDetailCourse(null);
    setDetailBundle(null);
    setDetailLesson(null);
    setDetailPriceOption(null);
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

  const closeDrawer = () => {
    setDrawerCourse(null);
    setDrawerBundle(null);
    setDrawerLesson(null);
    setDrawerPriceOption(null);
    setDrawerIsTrial(false);
  };

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

        <FilterSelect value={selectedBranch} onChange={handleBranchChange} disabled={!selectedCity} placeholder="בחרו סניף" options={branchOptions} selectedLabel={filteredBranches.find((b) => b.id === selectedBranch)?.name} active={activeField === 'branch'} />

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
        <p className={styles.emptyMessage}>טוען חוגים...</p>
      ) : showTable ? (
        <CourseList
          filteredCourses={filteredCourses}
          selectedAge={selectedAge ? parseInt(selectedAge, 10) : null}
          onSelect={toggleDetail}
        />
      ) : null}

      {/* Course detail overlay — portaled so mobile fixed layout stays viewport-aligned */}
      {detailCourse && (
        <WidgetPortal>
          <div className={styles.detailOverlay} onClick={() => { setDetailCourse(null); setDetailBundle(null); setDetailLesson(null); setDetailPriceOption(null); }} />
          <div className={styles.detailPanel}>
            <CourseExpandedDetail
              course={detailCourse}
              lesson={detailLesson ?? undefined}
              bundleOffer={detailBundle ?? undefined}
              priceOption={detailPriceOption ?? undefined}
              selectionFull={detailSelectionFull}
              alternatives={detailAlternatives}
              onSelectAlternative={handleSelectAlternative}
              onClose={() => { setDetailCourse(null); setDetailBundle(null); setDetailLesson(null); setDetailPriceOption(null); }}
              onEnroll={() => handleEnrollClick(false)}
              onBundleEnroll={detailBundleForLesson ? handleBundleEnrollClick : undefined}
              onTrialEnroll={handleTrialEnrollClick}
            />
          </div>
        </WidgetPortal>
      )}

      {/* Enrollment side drawer */}
      {drawerCourse && (
        <WidgetPortal>
          <div className={styles.drawerOverlay} onClick={closeDrawer} />
          <div className={styles.drawerPanel}>
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
                      ? `${drawerCourse.name} #${drawerCourse.display_id} (${drawerBundle.name || 'פעמיים בשבוע'})`
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
                onBack={closeDrawer}
                onComplete={finishFamilyRegistration}
                onRegisterAnother={handleRegisterAnother}
              />
            )}
          </div>
        </WidgetPortal>
      )}
    </div>
  );
}
