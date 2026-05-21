'use client';

import React, { useEffect, useState, Fragment, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import api from '@/lib/api';
import { getDayName, formatTimeRange } from '@/lib/courseUtils';
import CourseRegistrationForm from './CourseRegistrationForm';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function FilterSelect({
  value,
  onChange,
  disabled,
  loading,
  placeholder,
  children,
  active,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  return (
    <div className={`flex flex-1 min-w-[160px] items-stretch border-2 rounded-[5px] overflow-hidden ${active ? 'border-red-500' : 'border-transparent'}`}>
      <select
        ref={selectRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading}
        className="flex-1 h-10 bg-[#DDE0F5] px-3 text-sm text-[#1a1a5e] appearance-none border-0 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <div
        className="h-10 w-10 flex-shrink-0 flex items-center justify-center bg-[#F5C518] cursor-pointer"
        onClick={() => !disabled && !loading && selectRef.current?.click()}
      >
        {loading ? (
          <svg className="animate-spin text-[#1a1a5e]" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <ChevronDown size={16} className="text-[#1a1a5e]" />
        )}
      </div>
    </div>
  );
}

interface City {
  id: string;
  name: string;
}

interface Branch {
  id: string;
  name: string;
  city: string;
  city_name: string;
}

interface CourseLesson {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  instructor_name: string | null;
}

interface Course {
  id: string;
  name: string;
  course_type: string;
  course_type_name: string;
  branch_name: string;
  min_age: number | null;
  max_age: number | null;
  price: number | null;
  lessons_count: number;
  lessons: CourseLesson[];
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

  // Derived state
  const filteredBranches = selectedCity
    ? allBranches.filter((b) => b.city === selectedCity)
    : [];

  const courseTypes = Array.from(
    new Map(
      branchCourses.map((c) => [c.course_type, c.course_type_name])
    ).entries()
  ).map(([id, name]) => ({ id, name }));

  const coursesForType = selectedCourseType
    ? branchCourses.filter((c) => c.course_type === selectedCourseType)
    : branchCourses;

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

  // Load cities and branches once on mount
  useEffect(() => {
    setLoadingBranches(true);
    Promise.all([
      api.get('/core/cities/'),
      api.get('/core/branches/?simple=true'),
    ])
      .then(([citiesRes, branchesRes]) => {
        const citiesData = Array.isArray(citiesRes.data)
          ? citiesRes.data
          : citiesRes.data.results ?? [];
        const branchesData = Array.isArray(branchesRes.data)
          ? branchesRes.data
          : branchesRes.data.results ?? [];
        setCities(citiesData);
        setAllBranches(branchesData);
      })
      .finally(() => setLoadingBranches(false));
  }, []);

  // Load courses whenever selected branch changes
  useEffect(() => {
    if (!selectedBranch) {
      setBranchCourses([]);
      return;
    }
    setLoadingCourses(true);
    api
      .get(`/courses/courses/?branch_id=${selectedBranch}&include_lessons=true`)
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data.results ?? [];
        setBranchCourses(data);
      })
      .finally(() => setLoadingCourses(false));
  }, [selectedBranch]);

  const handleCityChange = (cityId: string) => {
    setSelectedCity(cityId);
    setSelectedBranch('');
    setBranchCourses([]);
    setSelectedCourseType('');
    setSelectedAge('');
  };

  const handleBranchChange = (branchId: string) => {
    setSelectedBranch(branchId);
    setSelectedCourseType('');
    setSelectedAge('');
  };

  const handleCourseTypeChange = (typeId: string) => {
    setSelectedCourseType(typeId);
    setSelectedAge('');
  };

  const selectedBranchName = allBranches.find((b) => b.id === selectedBranch)?.name ?? '—';

  const ageLabel = (age: number) => `${age} שנים`;

  const filledDropdowns = [selectedCity, selectedBranch, selectedCourseType, selectedAge].filter(Boolean).length;
  const showTable = filledDropdowns >= 3;

  return (
    <div dir="rtl" className="space-y-6 p-6">
        {/* Filter strip */}
        <div className="flex items-center gap-0 bg-[#2B3090] px-3 py-2 flex-wrap">
          <span className="text-white font-bold text-base px-4 whitespace-nowrap">חיפוש חוגים</span>

          <FilterSelect
            value={selectedCity}
            onChange={handleCityChange}
            loading={loadingBranches}
            placeholder="בחרו עיר"
          >
            {cities.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </FilterSelect>

          <FilterSelect
            value={selectedBranch}
            onChange={handleBranchChange}
            disabled={!selectedCity}
            loading={loadingBranches}
            placeholder="בחרו סניף"
          >
            {filteredBranches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </FilterSelect>

          <FilterSelect
            value={selectedCourseType}
            onChange={handleCourseTypeChange}
            disabled={!selectedBranch}
            loading={loadingCourses}
            placeholder="בחרו חוג"
          >
            {courseTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </FilterSelect>

          <FilterSelect
            value={selectedAge}
            onChange={setSelectedAge}
            disabled={!selectedCourseType}
            loading={Boolean(selectedCourseType && loadingCourses)}
            placeholder="בחרו גיל"
          >
            {ageOptions.map((age) => (
              <option key={age} value={age}>{ageLabel(age)}</option>
            ))}
          </FilterSelect>
        </div>

        {/* Results table */}
        {showTable && (
          <div className="card">
            {loadingCourses ? (
              <p className="text-center text-gray-500 py-10">טוען חוגים...</p>
            ) : filteredCourses.length === 0 ? (
              <p className="text-center text-gray-500 py-10">לא נמצאו חוגים</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#2B3090] hover:bg-[#2B3090]">
                    <TableHead className="text-white font-semibold">שם החוג</TableHead>
                    <TableHead className="text-white font-semibold">תחום</TableHead>
                    <TableHead className="text-white font-semibold">סניף</TableHead>
                    <TableHead className="text-white font-semibold">טווח גילאים</TableHead>
                    <TableHead className="text-white font-semibold">מחיר חודשי</TableHead>
                    <TableHead className="text-white font-semibold">שיעורים שבועיים</TableHead>
                    <TableHead className="text-white font-semibold">ימים ושעות</TableHead>
                    <TableHead className="text-white font-semibold">פרטים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCourses.map((course) => {
                    const isExpanded = expandedRows.has(course.id);
                    return (
                      <Fragment key={course.id}>
                        <TableRow>
                          <TableCell className="font-medium">{course.name}</TableCell>
                          <TableCell>{course.course_type_name || '—'}</TableCell>
                          <TableCell>{course.branch_name || selectedBranchName}</TableCell>
                          <TableCell>
                            {course.min_age != null && course.max_age != null
                              ? `${course.min_age}–${course.max_age}`
                              : course.min_age != null
                              ? `${course.min_age}+`
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {course.price != null ? `₪${course.price}` : '—'}
                          </TableCell>
                          <TableCell>{course.lessons_count}</TableCell>
                          <TableCell>
                            {course.lessons?.length
                              ? course.lessons.map((l) => `${getDayName(l.day_of_week)} ${formatTimeRange(l.start_time, l.end_time)}`).join(', ')
                              : '—'}
                          </TableCell>
                          <TableCell>
                            <button
                              onClick={() => toggleRow(course.id)}
                              className="p-1 rounded hover:bg-gray-100"
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-gray-50 p-4">
                              <div className="grid grid-cols-3 gap-4">
                                {/* Instructor */}
                                <div className="border rounded-lg overflow-hidden bg-white min-h-[80px]">
                                  <p className="text-xs font-semibold text-white px-3 py-1.5" style={{ backgroundColor: 'rgb(113, 145, 38)' }}>מדריך</p>
                                  <div className="p-3">
                                  {course.lessons?.length ? (
                                    Array.from(new Set(course.lessons.map((l) => l.instructor_name).filter(Boolean))).map((name) => (
                                      <p key={name} className="text-sm">{name}</p>
                                    ))
                                  ) : (
                                    <p className="text-sm text-gray-400">—</p>
                                  )}
                                  </div>
                                </div>
                                {/* Days & hours */}
                                <div className="border rounded-lg overflow-hidden bg-white min-h-[80px]">
                                  <p className="text-xs font-semibold text-white px-3 py-1.5" style={{ backgroundColor: 'rgb(113, 145, 38)' }}>ימים ושעות</p>
                                  <div className="p-3">
                                  {course.lessons?.length ? (
                                    course.lessons.map((l, i) => (
                                      <p key={i} className="text-sm">{getDayName(l.day_of_week)} {formatTimeRange(l.start_time, l.end_time)}</p>
                                    ))
                                  ) : (
                                    <p className="text-sm text-gray-400">—</p>
                                  )}
                                  </div>
                                </div>
                                {/* Price & registration */}
                                <div className="border rounded-lg overflow-hidden bg-white min-h-[80px] flex flex-col">
                                  <p className="text-xs font-semibold text-white px-3 py-1.5" style={{ backgroundColor: 'rgb(113, 145, 38)' }}>מחיר</p>
                                  <div className="p-3 flex flex-col gap-2 flex-1">
                                  <p className="text-sm font-medium">
                                    {course.price != null ? `₪${course.price} לחודש` : '—'}
                                  </p>
                                  <button
                                    onClick={() => setDrawerCourse(course)}
                                    className="w-full rounded-md px-3 py-1.5 text-sm text-white bg-[#2B3090]"
                                  >
                                    הירשם לחוג
                                  </button>
                                  <button
                                    className="w-full rounded-md px-3 py-1.5 text-sm border border-[#2B3090] text-[#2B3090]"
                                  >
                                    הירשם לשיעור ניסיון
                                  </button>
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
          <div
            className="fixed inset-0 bg-black/40"
            style={{ zIndex: 1000 }}
            onClick={() => setDrawerCourse(null)}
          />
          <div
            className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl overflow-y-auto p-6"
            style={{ zIndex: 1001 }}
          >
            <CourseRegistrationForm
              courseId={drawerCourse.id}
              courseName={drawerCourse.name}
              onBack={() => setDrawerCourse(null)}
              onComplete={(paymentUrl) => {
                if (paymentUrl) {
                  window.location.href = paymentUrl;
                } else {
                  setDrawerCourse(null);
                }
              }}
            />
          </div>
        </>
      )}
      </div>
  );
}
