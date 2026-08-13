'use client';

import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import api from '@/lib/api';
import CourseRegistrationForm from './CourseRegistrationForm';
import CourseExpandedDetail from './CourseExpandedDetail/index';
import { CourseList } from './CourseList/CourseList';
import type { City, Branch, Course, CourseBundle, CourseLesson } from './types';
import { sortCitiesByFixedOrder, normalizeExternalLink } from './page.utils';
import { isCourseVisibleInWidgetCatalog } from './lessonVisibility';
import { AGE_OPTIONS, formatAge } from '@/lib/courseUtils';
import { dedupeCitiesByName } from '@/lib/cityUtils';
import { findWidgetAlternatives, isWidgetSelectionFull, type WidgetAlternative } from './alternativeLessons';
import styles from './page.module.css';

type PanelPos = { top: number; left: number; width: number };

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

function FilterSelect({ value, onChange, disabled, loading, placeholder, selectedLabel, children, active }: { value: string; onChange: (v: string) => void; disabled?: boolean; loading?: boolean; placeholder: string; selectedLabel?: string; children: React.ReactNode; active?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);

  const options = React.Children.toArray(children)
    .filter(React.isValidElement)
    .map((child) => {
      const el = child as React.ReactElement<{ value: string | number; children: React.ReactNode }>;
      return { value: String(el.props.value), label: String(el.props.children) };
    });

  const openPanel = () => {
    if (disabled || loading || typeof window === 'undefined' || window.innerWidth >= 768) return;
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPanelPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    setIsOpen(true);
  };

  const closePanel = () => setIsOpen(false);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => { if (window.innerWidth >= 768) setIsOpen(false); };
    const onScroll = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      setIsOpen(false);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [isOpen]);

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

  const panel = isOpen && panelPos ? (
    <>
      <div className={styles.dropdownBackdrop} onClick={closePanel} />
      <ul ref={panelRef} role="listbox" aria-label={placeholder} className={styles.dropdownPanel} style={{ '--dp-top': `${panelPos.top}px`, '--dp-left': `${panelPos.left}px`, '--dp-width': `${panelPos.width}px` } as React.CSSProperties}>
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
          {children}
        </select>
        <span className={styles.filterDisplayText}>{value ? selectedLabel : placeholder}</span>
        <div className={styles.filterIconBox}>{chevronIcon}</div>
      </div>
      {typeof document !== 'undefined' && panel ? ReactDOM.createPortal(panel, document.body) : null}
    </>
  );
}

export default function WidgetPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [allCoursesMap, setAllCoursesMap] = useState<Record<string, Course[]>>({});

  const [selectedCity, setSelectedCity] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedCourseType, setSelectedCourseType] = useState('');
  const [selectedAge, setSelectedAge] = useState('');

  const [loadingBranches, setLoadingBranches] = useState(true);
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

  const branchCourses = selectedBranch ? (allCoursesMap[selectedBranch] ?? []) : [];

  const filteredBranches = selectedCity ? allBranches.filter((b) => b.city === selectedCity) : [];

  const courseTypes = Array.from(
    new Map(
      branchCourses
        .filter(isCourseVisibleInWidgetCatalog)
        .map((c) => [String(c.course_type), c.course_type_name])
    ).entries()
  ).map(([id, name]) => ({ id, name }));

  const filteredCourses = branchCourses.filter((course) => {
    if (selectedCourseType && String(course.course_type) !== selectedCourseType) return false;
    if (selectedAge) {
      const age = parseInt(selectedAge);
      const minAge = course.min_age ?? 0;
      const maxAge = course.max_age ?? 99;
      if (age < minAge || age > maxAge) return false;
    }
    return isCourseVisibleInWidgetCatalog(course);
  });

  useEffect(() => {
    setLoadingBranches(true);
    Promise.all([api.get('/customers/widget/cities/'), api.get('/customers/widget/branches/')])
      .then(([citiesRes, branchesRes]) => {
        const citiesData = Array.isArray(citiesRes.data) ? citiesRes.data : citiesRes.data.results ?? [];
        const branchesData: Branch[] = Array.isArray(branchesRes.data) ? branchesRes.data : branchesRes.data.results ?? [];
        setCities(sortCitiesByFixedOrder(dedupeCitiesByName(citiesData)));
        setAllBranches(branchesData);
        return Promise.all(
          branchesData.map((b) =>
            api.get(`/customers/widget/courses/?branch_id=${b.id}`)
              .then((res) => ({ branchId: b.id, courses: Array.isArray(res.data) ? res.data : (res.data.results ?? []) as Course[] }))
          )
        );
      })
      .then((results) => {
        const map: Record<string, Course[]> = {};
        for (const { branchId, courses } of results) map[branchId] = courses;
        setAllCoursesMap(map);
      })
      .finally(() => setLoadingBranches(false));
  }, []);

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

  const handleCityChange = (cityId: string) => { setSelectedCity(cityId); setSelectedBranch(''); setSelectedCourseType(''); setSelectedAge(''); };
  const handleBranchChange = (branchId: string) => { setSelectedBranch(branchId); setSelectedCourseType(''); setSelectedAge(''); };
  const handleCourseTypeChange = (typeId: string) => { setSelectedCourseType(typeId); setSelectedAge(''); };

  const filledDropdowns = [selectedCity, selectedBranch, selectedCourseType, selectedAge].filter(Boolean).length;
  const showTable = filledDropdowns >= 3;

  const showNoMatchingCoursesMessage =
    Boolean(selectedBranch) &&
    !loadingBranches &&
    (courseTypes.length === 0 || (showTable && filteredCourses.length === 0));

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
          
        <FilterSelect value={selectedCity} onChange={handleCityChange} loading={loadingBranches} placeholder="בחרו עיר" selectedLabel={cities.find((c) => c.id === selectedCity)?.name} active={activeField === 'city'}>
          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </FilterSelect>

        <FilterSelect value={selectedBranch} onChange={handleBranchChange} disabled={!selectedCity} loading={loadingBranches} placeholder="בחרו סניף" selectedLabel={filteredBranches.find((b) => b.id === selectedBranch)?.name} active={activeField === 'branch'}>
          {filteredBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </FilterSelect>

        <FilterSelect value={selectedCourseType} onChange={handleCourseTypeChange} disabled={!selectedBranch} placeholder="בחרו חוג" selectedLabel={courseTypes.find((t) => t.id === selectedCourseType)?.name} active={activeField === 'courseType'}>
          {courseTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </FilterSelect>

        <FilterSelect value={selectedAge} onChange={setSelectedAge} disabled={!selectedCourseType} placeholder="בחרו גיל" selectedLabel={selectedAge ? formatAge(parseInt(selectedAge)) : undefined} active={activeField === 'age'}>
          {AGE_OPTIONS.map((age) => <option key={age} value={age}>{formatAge(age)}</option>)}
        </FilterSelect>
      </div>

      {/* Course list */}
      {showNoMatchingCoursesMessage ? (
        <NoMatchingCoursesMessage />
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
