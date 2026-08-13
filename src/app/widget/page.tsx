'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import api from '@/lib/api';
import CourseRegistrationForm from './CourseRegistrationForm';
import CourseExpandedDetail from './CourseExpandedDetail/index';
import { CourseList } from './CourseList/CourseList';
import type { Branch, Course, CourseBundle, CourseLesson } from './types';
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

type PanelPlacement = { direction: 'below' | 'above'; maxHeight: number; fits: boolean };

function computePlacement(fieldRect: DOMRect, desiredHeight: number): PanelPlacement {
  const band = visibleBand();
  const spaceBelow = band.bottom - fieldRect.bottom - PANEL_GAP * 2;
  const spaceAbove = fieldRect.top - band.top - PANEL_GAP * 2;

  if (desiredHeight <= spaceBelow) return { direction: 'below', maxHeight: desiredHeight, fits: true };
  if (desiredHeight <= spaceAbove) return { direction: 'above', maxHeight: desiredHeight, fits: true };

  const useAbove = spaceAbove > spaceBelow;
  const room = Math.max(MIN_PANEL_HEIGHT, useAbove ? spaceAbove : spaceBelow);
  return { direction: useAbove ? 'above' : 'below', maxHeight: room, fits: false };
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

/** Ask the B2C host (and this page) to scroll until the whole list has room. */
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
  const [placement, setPlacement] = useState<PanelPlacement>({ direction: 'below', maxHeight: MAX_PANEL_HEIGHT, fits: true });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const desiredHeight = panelHeightForOptions(options.length);

  const syncPlacement = useCallback(() => {
    const field = wrapperRef.current;
    if (!field) return;
    const next = computePlacement(field.getBoundingClientRect(), desiredHeight);
    setPlacement((prev) =>
      prev.direction === next.direction && Math.abs(prev.maxHeight - next.maxHeight) < 2 && prev.fits === next.fits
        ? prev
        : next,
    );
  }, [desiredHeight]);

  const openPanel = () => {
    if (disabled || loading || typeof window === 'undefined') return;
    ensureHostBandBridge();
    requestHostBand();
    const field = wrapperRef.current;
    if (field) {
      const rect = field.getBoundingClientRect();
      const next = computePlacement(rect, desiredHeight);
      setPlacement(next);
      // Not enough visible room either way — nudge the page so the list fits below.
      if (!next.fits) requestReveal(rect, desiredHeight);
    }
    setIsOpen(true);
  };

  const closePanel = () => setIsOpen(false);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    closePanel();
  };

  // Keep the list inside the visible band while it is open: the host reports a
  // new band on every scroll, and standalone we watch scroll/resize ourselves.
  useEffect(() => {
    if (!isOpen) return;
    syncPlacement();
    bandSubscribers.add(syncPlacement);
    window.addEventListener('scroll', syncPlacement, { passive: true });
    window.addEventListener('resize', syncPlacement);
    window.visualViewport?.addEventListener('resize', syncPlacement);
    window.visualViewport?.addEventListener('scroll', syncPlacement);
    return () => {
      bandSubscribers.delete(syncPlacement);
      window.removeEventListener('scroll', syncPlacement);
      window.removeEventListener('resize', syncPlacement);
      window.visualViewport?.removeEventListener('resize', syncPlacement);
      window.visualViewport?.removeEventListener('scroll', syncPlacement);
    };
  }, [isOpen, syncPlacement]);

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
      className={`${styles.dropdownPanel} ${placement.direction === 'above' ? styles.dropdownPanelAbove : ''}`}
      style={{ '--dp-max-height': `${placement.maxHeight}px` } as React.CSSProperties}
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
  const [drawerCourse, setDrawerCourse] = useState<Course | null>(null);
  const [drawerBundle, setDrawerBundle] = useState<CourseBundle | null>(null);
  const [drawerLesson, setDrawerLesson] = useState<CourseLesson | null>(null);
  const [drawerIsTrial, setDrawerIsTrial] = useState(false);

  const toggleDetail = (course: Course, bundle?: CourseBundle, lesson?: CourseLesson) => {
    const isSame =
      detailCourse?.id === course.id &&
      detailBundle?.id === bundle?.id &&
      detailLesson?.id === lesson?.id;
    setDetailCourse(isSame ? null : course);
    setDetailBundle(isSame ? null : (bundle ?? null));
    setDetailLesson(isSame ? null : (lesson ?? null));
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
      const age = parseInt(selectedAge);
      const minAge = course.min_age ?? 0;
      const maxAge = course.max_age ?? 99;
      if (age < minAge || age > maxAge) return false;
    }
    return isCourseVisibleInWidgetCatalog(course);
  }), [branchCourses, selectedCourseType, selectedAge]);

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

  useEffect(() => {
    const expanded = !!(detailCourse || drawerCourse);
    window.parent.postMessage(
      { type: expanded ? 'kogo-widget-expand' : 'kogo-widget-collapse' },
      '*'
    );
  }, [detailCourse, drawerCourse]);

  useEffect(() => {
    if (!detailCourse && !drawerCourse) return;
    const { body, documentElement } = document;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = documentElement.style.overflow;
    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    return () => {
      body.style.overflow = prevBodyOverflow;
      documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [detailCourse, drawerCourse]);

  const handleEnrollClick = (isTrial = false, bundleOverride?: CourseBundle | null) => {
    const branch = allBranches.find((b) => b.id === selectedBranch);
    const externalLink = detailCourse?.external_link || branch?.external_link;
    if (branch?.is_external && externalLink) {
      window.open(normalizeExternalLink(externalLink), '_blank', 'noopener,noreferrer');
      setDetailCourse(null);
      setDetailBundle(null);
      setDetailLesson(null);
      return;
    }
    setDrawerCourse(detailCourse);
    setDrawerBundle(bundleOverride ?? detailBundle ?? null);
    setDrawerLesson(detailLesson);
    setDrawerIsTrial(isTrial);
    setDetailCourse(null);
    setDetailBundle(null);
    setDetailLesson(null);
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
    <div dir="rtl" className={styles.page}>
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

      {/* Course list */}
      {showNoMatchingCoursesMessage ? (
        <NoMatchingCoursesMessage />
      ) : showCourseListLoading ? (
        <p className={styles.emptyMessage}>טוען חוגים...</p>
      ) : showTable ? (
        <CourseList filteredCourses={filteredCourses} onSelect={toggleDetail} />
      ) : null}

      {/* Course detail overlay — portaled so mobile fixed layout stays viewport-aligned */}
      {detailCourse && (
        <WidgetPortal>
          <div className={styles.detailOverlay} onClick={() => { setDetailCourse(null); setDetailBundle(null); setDetailLesson(null); }} />
          <div className={styles.detailPanel}>
            <CourseExpandedDetail
              course={detailCourse}
              lesson={detailLesson ?? undefined}
              bundleOffer={activeDetailBundle ?? undefined}
              selectionFull={detailSelectionFull}
              alternatives={detailAlternatives}
              onSelectAlternative={handleSelectAlternative}
              onClose={() => { setDetailCourse(null); setDetailBundle(null); setDetailLesson(null); }}
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
          <div className={styles.drawerOverlay} onClick={() => { setDrawerCourse(null); setDrawerIsTrial(false); }} />
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
                courseName={drawerBundle ? `${drawerCourse.name} (${drawerBundle.name || 'פעמיים בשבוע'})` : drawerCourse.name}
                isAdult={drawerCourse.is_adult ?? false}
                bundleId={drawerBundle?.id}
                lessonId={drawerLesson?.id}
                trialLessonOptions={drawerLesson ? [] : (drawerBundle?.lessons ?? [])}
                isTrial={drawerIsTrial}
                trialLessonIsPaid={drawerCourse.trial_lesson_is_paid ?? false}
                trialLessonPrice={
                  drawerCourse.trial_lesson_price != null
                    ? Number(drawerCourse.trial_lesson_price)
                    : null
                }
                onBack={() => { setDrawerCourse(null); setDrawerBundle(null); setDrawerLesson(null); setDrawerIsTrial(false); }}
                onComplete={() => { setDrawerCourse(null); setDrawerBundle(null); setDrawerLesson(null); setDrawerIsTrial(false); }}
              />
            )}
          </div>
        </WidgetPortal>
      )}
    </div>
  );
}
