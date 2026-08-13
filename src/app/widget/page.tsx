'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

type PanelPos = {
  left: number;
  width: number;
  maxHeight: number;
  placement: 'below' | 'above' | 'sheet';
  top?: number;
  bottom?: number;
};

const MOBILE_DROPDOWN_GAP = 6;
const MOBILE_DROPDOWN_EDGE = 8;
const MOBILE_OPTION_HEIGHT = 44;
const MOBILE_MIN_PANEL_HEIGHT = 100;

function getMobileViewport() {
  const vv = window.visualViewport;
  const top = vv?.offsetTop ?? 0;
  const height = vv?.height ?? window.innerHeight;
  const width = vv?.width ?? window.innerWidth;
  return {
    top,
    left: vv?.offsetLeft ?? 0,
    height,
    width,
    bottom: top + height,
  };
}

function computeMobilePanelPosition(rect: DOMRect, optionCount: number): PanelPos {
  const viewport = getMobileViewport();
  const idealHeight = Math.min(280, Math.max(optionCount, 1) * MOBILE_OPTION_HEIGHT + 8);
  const width = Math.min(rect.width, viewport.width - MOBILE_DROPDOWN_EDGE * 2);
  const left = Math.max(
    MOBILE_DROPDOWN_EDGE,
    Math.min(rect.left, viewport.width - width - MOBILE_DROPDOWN_EDGE),
  );

  const spaceBelow = viewport.bottom - rect.bottom - MOBILE_DROPDOWN_GAP - MOBILE_DROPDOWN_EDGE;
  const spaceAbove = rect.top - viewport.top - MOBILE_DROPDOWN_GAP - MOBILE_DROPDOWN_EDGE;

  // Short iframe / lower filters: anchor a scrollable sheet to the bottom of the screen.
  if (Math.max(spaceBelow, spaceAbove) < 160 && idealHeight > spaceBelow) {
    const sheetHeight = Math.min(idealHeight, Math.max(viewport.height * 0.55, 180));
    return {
      left: MOBILE_DROPDOWN_EDGE,
      width: viewport.width - MOBILE_DROPDOWN_EDGE * 2,
      maxHeight: Math.min(sheetHeight, viewport.height - MOBILE_DROPDOWN_EDGE * 2),
      placement: 'sheet',
      bottom: MOBILE_DROPDOWN_EDGE,
    };
  }

  let placement: 'below' | 'above' = 'below';
  if (spaceBelow < idealHeight && spaceAbove > spaceBelow) {
    placement = 'above';
  }

  const available = placement === 'below' ? spaceBelow : spaceAbove;
  let maxHeight = Math.max(MOBILE_MIN_PANEL_HEIGHT, Math.min(idealHeight, available));

  if (placement === 'below') {
    let top = rect.bottom + MOBILE_DROPDOWN_GAP;
    const maxBottom = viewport.bottom - MOBILE_DROPDOWN_EDGE;
    if (top + maxHeight > maxBottom) {
      maxHeight = Math.max(MOBILE_MIN_PANEL_HEIGHT, maxBottom - top);
    }
    if (maxHeight < MOBILE_MIN_PANEL_HEIGHT && spaceAbove > spaceBelow) {
      placement = 'above';
    } else {
      return { left, width, maxHeight, placement, top };
    }
  }

  const bottom = viewport.bottom - rect.top + MOBILE_DROPDOWN_GAP;
  maxHeight = Math.max(MOBILE_MIN_PANEL_HEIGHT, Math.min(idealHeight, spaceAbove));
  const maxTop = rect.top - MOBILE_DROPDOWN_GAP;
  if (maxTop - maxHeight < viewport.top + MOBILE_DROPDOWN_EDGE) {
    maxHeight = Math.max(MOBILE_MIN_PANEL_HEIGHT, maxTop - viewport.top - MOBILE_DROPDOWN_EDGE);
  }

  return {
    left,
    width,
    maxHeight,
    placement: 'above',
    bottom,
  };
}

/** After paint, nudge the panel if the viewport still clips it (common on iOS iframes). */
function nudgePanelIntoView(pos: PanelPos, panelEl: HTMLElement): PanelPos {
  const viewport = getMobileViewport();
  const edge = MOBILE_DROPDOWN_EDGE;
  const rect = panelEl.getBoundingClientRect();
  const maxBottom = viewport.bottom - edge;
  const minTop = viewport.top + edge;

  if (rect.bottom <= maxBottom && rect.top >= minTop) {
    return pos;
  }

  const next: PanelPos = { ...pos };

  if (rect.bottom > maxBottom) {
    const overflow = rect.bottom - maxBottom;
    if (pos.placement === 'below' && pos.top != null) {
      next.top = Math.max(minTop, pos.top - overflow);
    } else {
      next.bottom = (pos.bottom ?? edge) + overflow;
    }
    next.maxHeight = Math.max(MOBILE_MIN_PANEL_HEIGHT, pos.maxHeight - overflow);
  }

  if (rect.top < minTop) {
    const overflow = minTop - rect.top;
    if (pos.placement === 'below' && next.top != null) {
      next.top = next.top + overflow;
    } else if (pos.placement === 'above' || pos.placement === 'sheet') {
      next.bottom = Math.max(edge, (next.bottom ?? edge) - overflow);
    }
    next.maxHeight = Math.max(MOBILE_MIN_PANEL_HEIGHT, next.maxHeight - overflow);
  }

  return next;
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
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const nudgePassRef = useRef(0);

  const openPanel = () => {
    if (disabled || loading || typeof window === 'undefined' || window.innerWidth >= 768) return;
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    nudgePassRef.current = 0;
    setPanelPos(computeMobilePanelPosition(rect, options.length));
    setIsOpen(true);
  };

  const closePanel = () => {
    setIsOpen(false);
    setPanelPos(null);
    nudgePassRef.current = 0;
  };

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const updatePanelPosition = () => {
      if (window.innerWidth >= 768) {
        setIsOpen(false);
        return;
      }
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect) setPanelPos(computeMobilePanelPosition(rect, options.length));
    };

    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.visualViewport?.addEventListener('resize', updatePanelPosition);
    window.visualViewport?.addEventListener('scroll', updatePanelPosition);

    const onScroll = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      setIsOpen(false);
    };
    window.addEventListener('scroll', onScroll, true);

    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.visualViewport?.removeEventListener('resize', updatePanelPosition);
      window.visualViewport?.removeEventListener('scroll', updatePanelPosition);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [isOpen, options.length]);

  useLayoutEffect(() => {
    if (!isOpen || !panelRef.current || !panelPos || nudgePassRef.current >= 2) return;

    const refined = nudgePanelIntoView(panelPos, panelRef.current);
    const changed =
      refined.top !== panelPos.top
      || refined.bottom !== panelPos.bottom
      || refined.maxHeight !== panelPos.maxHeight;

    if (!changed) return;

    nudgePassRef.current += 1;
    setPanelPos(refined);
  }, [isOpen, panelPos]);

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

  const panelPlacementClass =
    panelPos?.placement === 'above'
      ? styles.dropdownPanelAbove
      : panelPos?.placement === 'sheet'
        ? styles.dropdownPanelSheet
        : styles.dropdownPanelBelow;

  const panel = isOpen && panelPos ? (
    <>
      <div className={styles.dropdownBackdrop} onClick={closePanel} />
      <ul
        ref={panelRef}
        role="listbox"
        aria-label={placeholder}
        className={`${styles.dropdownPanel} ${panelPlacementClass}`}
        style={{
          '--dp-left': `${panelPos.left}px`,
          '--dp-width': `${panelPos.width}px`,
          '--dp-max-height': `${panelPos.maxHeight}px`,
          ...(panelPos.top != null ? { '--dp-top': `${panelPos.top}px` } : {}),
          ...(panelPos.bottom != null ? { '--dp-bottom': `${panelPos.bottom}px` } : {}),
        } as React.CSSProperties}
      >
        {options.length === 0 ? (
          <li className={styles.dropdownEmpty}>אין אפשרויות</li>
        ) : options.map((opt) => (
          <li key={opt.value} role="option" aria-selected={opt.value === value} className={`${styles.dropdownOption} ${opt.value === value ? styles.dropdownOptionSelected : ''}`} onClick={() => handleSelect(opt.value)}>
            {opt.label}
          </li>
        ))}
      </ul>
    </>
  ) : null;

  return (
    <>
      <div ref={wrapperRef} className={`${styles.filterWrapper} ${active ? styles.filterWrapperActive : ''}`} onClick={openPanel} aria-haspopup="listbox" aria-expanded={isOpen}>
        <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || loading} className={styles.filterSelect}>
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <span className={styles.filterDisplayText}>{value ? selectedLabel : placeholder}</span>
        <div className={styles.filterIconBox}>{chevronIcon}</div>
      </div>
      {typeof document !== 'undefined' && panel ? ReactDOM.createPortal(panel, document.body) : null}
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
    const seen = new Set<string>();
    return allBranches.filter((b) => {
      if (b.city !== selectedCity || seen.has(b.id)) return false;
      seen.add(b.id);
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
    if (cityBranches.length === 1) {
      setSelectedBranch(cityBranches[0].id);
    }
  }, [selectedCity, allBranches]);


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

        <FilterSelect value={selectedBranch} onChange={handleBranchChange} disabled={!selectedCity} loading={loadingBranches} placeholder="בחרו סניף" options={branchOptions} selectedLabel={filteredBranches.find((b) => b.id === selectedBranch)?.name} active={activeField === 'branch'} />

        <FilterSelect value={selectedCourseType} onChange={handleCourseTypeChange} disabled={!selectedBranch} loading={loadingCourseTypes} placeholder="בחרו חוג" options={courseTypeOptions} selectedLabel={courseTypes.find((t) => t.id === selectedCourseType)?.name} active={activeField === 'courseType'} />

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
