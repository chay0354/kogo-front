'use client';

import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import api from '@/lib/api';
import CourseRegistrationForm from './CourseRegistrationForm';
import CourseExpandedDetail from './CourseExpandedDetail/index';
import { CourseList } from './CourseList/CourseList';
import type { City, Branch, Course } from './types';
import styles from './page.module.css';

type PanelPos = { top: number; left: number; width: number };

function FilterSelect({ value, onChange, disabled, loading, placeholder, selectedLabel, children, active }: { value: string; onChange: (v: string) => void; disabled?: boolean; loading?: boolean; placeholder: string; selectedLabel?: string; children: React.ReactNode; active?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

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
    const onScroll = () => setIsOpen(false);
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
  ) : (
    <ChevronDown size={16} className={styles.filterChevron} />
  );

  const panel = isOpen && panelPos ? (
    <>
      <div className={styles.dropdownBackdrop} onClick={closePanel} />
      <ul
        role="listbox"
        aria-label={placeholder}
        className={styles.dropdownPanel}
        style={{ '--dp-top': `${panelPos.top}px`, '--dp-left': `${panelPos.left}px`, '--dp-width': `${panelPos.width}px` } as React.CSSProperties}
      >
        {options.length === 0 ? (
          <li className={styles.dropdownEmpty}>אין אפשרויות</li>
        ) : options.map((opt) => (
          <li
            key={opt.value}
            role="option"
            aria-selected={opt.value === value}
            className={`${styles.dropdownOption} ${opt.value === value ? styles.dropdownOptionSelected : ''}`}
            onClick={() => handleSelect(opt.value)}
          >
            {opt.label}
          </li>
        ))}
      </ul>
    </>
  ) : null;

  return (
    <>
      <div
        ref={wrapperRef}
        className={`${styles.filterWrapper} ${active ? styles.filterWrapperActive : ''}`}
        onClick={openPanel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
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
  const [drawerCourse, setDrawerCourse] = useState<Course | null>(null);

  const toggleDetail = (course: Course) =>
    setDetailCourse((prev) => (prev?.id === course.id ? null : course));

  const branchCourses = selectedBranch ? (allCoursesMap[selectedBranch] ?? []) : [];

  const filteredBranches = selectedCity ? allBranches.filter((b) => b.city === selectedCity) : [];

  const courseTypes = Array.from(
    new Map(branchCourses.map((c) => [String(c.course_type), c.course_type_name])).entries()
  ).map(([id, name]) => ({ id, name }));

  const coursesForType = selectedCourseType ? branchCourses.filter((c) => String(c.course_type) === selectedCourseType) : branchCourses;

  const ageOptions = (() => {
    const min = Math.min(...coursesForType.map((c) => c.min_age ?? 3));
    const max = Math.max(...coursesForType.map((c) => c.max_age ?? 18));
    if (!isFinite(min) || !isFinite(max)) return [];
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  })();

  const filteredCourses = branchCourses.filter((course) => {
    if (selectedCourseType && String(course.course_type) !== selectedCourseType) return false;
    if (selectedAge) {
      const age = parseInt(selectedAge);
      const minAge = course.min_age ?? 0;
      const maxAge = course.max_age ?? 99;
      if (age < minAge || age > maxAge) return false;
    }
    return true;
  });

  useEffect(() => {
    setLoadingBranches(true);
    Promise.all([api.get('/customers/widget/cities/'), api.get('/customers/widget/branches/')])
      .then(([citiesRes, branchesRes]) => {
        const citiesData = Array.isArray(citiesRes.data) ? citiesRes.data : citiesRes.data.results ?? [];
        const branchesData: Branch[] = Array.isArray(branchesRes.data) ? branchesRes.data : branchesRes.data.results ?? [];
        setCities(citiesData);
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

  const handleCityChange = (cityId: string) => { setSelectedCity(cityId); setSelectedBranch(''); setSelectedCourseType(''); setSelectedAge(''); };
  const handleBranchChange = (branchId: string) => { setSelectedBranch(branchId); setSelectedCourseType(''); setSelectedAge(''); };
  const handleCourseTypeChange = (typeId: string) => { setSelectedCourseType(typeId); setSelectedAge(''); };

const ageLabel = (age: number) => `${age} שנים`;
  const filledDropdowns = [selectedCity, selectedBranch, selectedCourseType, selectedAge].filter(Boolean).length;
  const showTable = filledDropdowns >= 3;

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

        <FilterSelect value={selectedAge} onChange={setSelectedAge} disabled={!selectedCourseType} placeholder="בחרו גיל" selectedLabel={selectedAge ? ageLabel(parseInt(selectedAge)) : undefined} active={activeField === 'age'}>
          {ageOptions.map((age) => <option key={age} value={age}>{ageLabel(age)}</option>)}
        </FilterSelect>
      </div>

      {/* Course list */}
      {showTable && (
        <>
          {filteredCourses.length === 0 ? (
            <p className={styles.emptyMessage}>לא נמצאו חוגים</p>
          ) : (
            <CourseList filteredCourses={filteredCourses} onSelect={toggleDetail} />
          )}
        </>
      )}

      {/* Course detail overlay */}
      {detailCourse && (
        <>
          <div className={styles.detailOverlay} onClick={() => setDetailCourse(null)} />
          <div className={styles.detailPanel}>
            <CourseExpandedDetail
              course={detailCourse}
              onClose={() => setDetailCourse(null)}
              onEnroll={() => { setDrawerCourse(detailCourse); setDetailCourse(null); }}
            />
          </div>
        </>
      )}

      {/* Enrollment side drawer */}
      {drawerCourse && (
        <>
          <div className={styles.drawerOverlay} onClick={() => setDrawerCourse(null)} />
          <div className={styles.drawerPanel}>
            {allBranches.find((b) => b.id === selectedBranch)?.is_external ? (
              <div className={styles.externalBranchMessage}>
                {(() => {
                  const branch = allBranches.find((b) => b.id === selectedBranch);
                  return branch?.external_link ? (
                    <a href={/^https?:\/\//i.test(branch.external_link) ? branch.external_link : `https://${branch.external_link}`} target="_blank" rel="noopener noreferrer" className={styles.externalBranchText}>
                      לחצו כאן להמשך רישום בסניף
                    </a>
                  ) : (
                    <p className={styles.externalBranchText}>לחצו כאן להמשך רישום בסניף</p>
                  );
                })()}
              </div>
            ) : (
              <CourseRegistrationForm courseId={drawerCourse.id} courseName={drawerCourse.name} onBack={() => setDrawerCourse(null)} onComplete={() => setDrawerCourse(null)} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
