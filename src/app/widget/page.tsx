'use client';

import React, { useEffect, useState, Fragment, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import api from '@/lib/api';
import { getDayName, formatTimeRange } from '@/lib/courseUtils';
import CourseRegistrationForm from './CourseRegistrationForm';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { City, Branch, Course } from './types';
import styles from './page.module.css';

function FilterSelect({ value, onChange, disabled, loading, placeholder, children, active }: { value: string; onChange: (v: string) => void; disabled?: boolean; loading?: boolean; placeholder: string; children: React.ReactNode; active?: boolean }) {
  const selectRef = useRef<HTMLSelectElement>(null);
  return (
    <div className={`${styles.filterWrapper} ${active ? styles.filterWrapperActive : ''}`}>
      <select ref={selectRef} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || loading} className={styles.filterSelect}>
        <option value="">{placeholder}</option>
        {children}
      </select>
      <div className={styles.filterIconBox} onClick={() => !disabled && !loading && selectRef.current?.click()}>
        {loading ? (
          <svg className={styles.filterSpinner} width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <ChevronDown size={16} className={styles.filterChevron} />
        )}
      </div>
    </div>
  );
}

export default function WidgetPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [branchCourses, setBranchCourses] = useState<Course[]>([]);

  const [selectedCity, setSelectedCity] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedCourseType, setSelectedCourseType] = useState('');
  const [selectedAge, setSelectedAge] = useState('');

  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [drawerCourse, setDrawerCourse] = useState<Course | null>(null);

  const toggleRow = (id: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const filteredBranches = selectedCity ? allBranches.filter((b) => b.city === selectedCity) : [];

  const courseTypes = Array.from(
    new Map(branchCourses.map((c) => [c.course_type, c.course_type_name])).entries()
  ).map(([id, name]) => ({ id, name }));

  const coursesForType = selectedCourseType ? branchCourses.filter((c) => c.course_type === selectedCourseType) : branchCourses;

  const ageOptions = (() => {
    const min = Math.min(...coursesForType.map((c) => c.min_age ?? 3));
    const max = Math.max(...coursesForType.map((c) => c.max_age ?? 18));
    if (!isFinite(min) || !isFinite(max)) return [];
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  })();

  const filteredCourses = branchCourses.filter((course) => {
    if (selectedCourseType && course.course_type !== selectedCourseType) return false;
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
    Promise.all([api.get('/core/cities/'), api.get('/core/branches/?simple=true')])
      .then(([citiesRes, branchesRes]) => {
        const citiesData = Array.isArray(citiesRes.data) ? citiesRes.data : citiesRes.data.results ?? [];
        const branchesData = Array.isArray(branchesRes.data) ? branchesRes.data : branchesRes.data.results ?? [];
        setCities(citiesData);
        setAllBranches(branchesData);
      })
      .finally(() => setLoadingBranches(false));
  }, []);

  useEffect(() => {
    if (!selectedBranch) { setBranchCourses([]); return; }
    setLoadingCourses(true);
    api.get(`/courses/courses/?branch_id=${selectedBranch}&include_lessons=true`)
      .then((res) => { const data = Array.isArray(res.data) ? res.data : res.data.results ?? []; setBranchCourses(data); })
      .finally(() => setLoadingCourses(false));
  }, [selectedBranch]);

  const handleCityChange = (cityId: string) => { setSelectedCity(cityId); setSelectedBranch(''); setBranchCourses([]); setSelectedCourseType(''); setSelectedAge(''); };
  const handleBranchChange = (branchId: string) => { setSelectedBranch(branchId); setSelectedCourseType(''); setSelectedAge(''); };
  const handleCourseTypeChange = (typeId: string) => { setSelectedCourseType(typeId); setSelectedAge(''); };

  const selectedBranchName = allBranches.find((b) => b.id === selectedBranch)?.name ?? '—';
  const ageLabel = (age: number) => `${age} שנים`;
  const filledDropdowns = [selectedCity, selectedBranch, selectedCourseType, selectedAge].filter(Boolean).length;
  const showTable = filledDropdowns >= 3;

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
          
        <FilterSelect value={selectedCity} onChange={handleCityChange} loading={loadingBranches} placeholder="בחרו עיר">
          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </FilterSelect>

        <FilterSelect value={selectedBranch} onChange={handleBranchChange} disabled={!selectedCity} loading={loadingBranches} placeholder="בחרו סניף">
          {filteredBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </FilterSelect>

        <FilterSelect value={selectedCourseType} onChange={handleCourseTypeChange} disabled={!selectedBranch} loading={loadingCourses} placeholder="בחרו חוג">
          {courseTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </FilterSelect>

        <FilterSelect value={selectedAge} onChange={setSelectedAge} disabled={!selectedCourseType} loading={Boolean(selectedCourseType && loadingCourses)} placeholder="בחרו גיל">
          {ageOptions.map((age) => <option key={age} value={age}>{ageLabel(age)}</option>)}
        </FilterSelect>
      </div>

      {/* Results table */}
      {showTable && (
        <div className="card">
          {loadingCourses ? (
            <p className={styles.emptyMessage}>טוען חוגים...</p>
          ) : filteredCourses.length === 0 ? (
            <p className={styles.emptyMessage}>לא נמצאו חוגים</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className={styles.headerRow}>
                  <TableHead className={styles.headerCell}>שם החוג</TableHead>
                  <TableHead className={styles.headerCell}>תחום</TableHead>
                  <TableHead className={styles.headerCell}>סניף</TableHead>
                  <TableHead className={styles.headerCell}>טווח גילאים</TableHead>
                  <TableHead className={styles.headerCell}>מחיר חודשי</TableHead>
                  <TableHead className={styles.headerCell}>שיעורים שבועיים</TableHead>
                  <TableHead className={styles.headerCell}>ימים ושעות</TableHead>
                  <TableHead className={styles.headerCell}>פרטים</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCourses.map((course) => {
                  const isExpanded = expandedRows.has(course.id);
                  return (
                    <Fragment key={course.id}>
                      <TableRow>
                        <TableCell className={styles.nameCell}>{course.name}</TableCell>
                        <TableCell>{course.course_type_name || '—'}</TableCell>
                        <TableCell>{course.branch_name || selectedBranchName}</TableCell>
                        <TableCell>{course.min_age != null && course.max_age != null ? `${course.min_age}–${course.max_age}` : course.min_age != null ? `${course.min_age}+` : '—'}</TableCell>
                        <TableCell>{course.price != null ? `₪${course.price}` : '—'}</TableCell>
                        <TableCell>{course.lessons_count}</TableCell>
                        <TableCell>{course.lessons?.length ? course.lessons.map((l) => `${getDayName(l.day_of_week)} ${formatTimeRange(l.start_time, l.end_time)}`).join(', ') : '—'}</TableCell>
                        <TableCell>
                          <button onClick={() => toggleRow(course.id)} className={styles.expandButton}>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={8} className={styles.expandedCell}>
                            <div className={styles.detailGrid}>
                              {/* Instructor */}
                              <div className={styles.detailCard}>
                                <p className={styles.detailCardHeader}>מדריך</p>
                                <div className={styles.detailCardBody}>
                                  {course.lessons?.length ? (
                                    Array.from(new Set(course.lessons.map((l) => l.instructor_name).filter(Boolean))).map((name) => <p key={name} className={styles.detailText}>{name}</p>)
                                  ) : (
                                    <p className={styles.detailTextMuted}>—</p>
                                  )}
                                </div>
                              </div>
                              {/* Days & hours */}
                              <div className={styles.detailCard}>
                                <p className={styles.detailCardHeader}>ימים ושעות</p>
                                <div className={styles.detailCardBody}>
                                  {course.lessons?.length ? (
                                    course.lessons.map((l, i) => <p key={i} className={styles.detailText}>{getDayName(l.day_of_week)} {formatTimeRange(l.start_time, l.end_time)}</p>)
                                  ) : (
                                    <p className={styles.detailTextMuted}>—</p>
                                  )}
                                </div>
                              </div>
                              {/* Price & registration */}
                              <div className={styles.detailCardFlex}>
                                <p className={styles.detailCardHeader}>מחיר</p>
                                <div className={styles.detailCardBodyFlex}>
                                  <p className={styles.detailPrice}>{course.price != null ? `₪${course.price} לחודש` : '—'}</p>
                                  <button onClick={() => setDrawerCourse(course)} className={styles.enrollButton}>הירשם לחוג</button>
                                  <button className={styles.trialButton}>הירשם לשיעור ניסיון</button>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Enrollment side drawer */}
      {drawerCourse && (
        <>
          <div className={styles.drawerOverlay} onClick={() => setDrawerCourse(null)} />
          <div className={styles.drawerPanel}>
            <CourseRegistrationForm courseId={drawerCourse.id} courseName={drawerCourse.name} onBack={() => setDrawerCourse(null)} onComplete={() => setDrawerCourse(null)} />
          </div>
        </>
      )}
    </div>
  );
}
