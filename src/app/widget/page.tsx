'use client';

import { useEffect, useState, Fragment } from 'react';
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
  const [registrationRows, setRegistrationRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      if (!next.has(id)) {
        setRegistrationRows((r) => { const s = new Set(r); s.delete(id); return s; });
      }
      return next;
    });

  const openRegistration = (id: string) =>
    setRegistrationRows((prev) => new Set(prev).add(id));

  const closeRegistration = (id: string) =>
    setRegistrationRows((prev) => { const s = new Set(prev); s.delete(id); return s; });

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

  const showTable = Boolean(selectedBranch);

  return (
    <div dir="rtl" className="space-y-6 p-6">
        {/* Filter strip */}
        <div className="card p-4">
          <div className="flex gap-4 flex-wrap">
            {/* City */}
            <div className="flex-1 min-w-[160px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                עיר
              </label>
              <select
                value={selectedCity}
                onChange={(e) => handleCityChange(e.target.value)}
                disabled={loadingBranches}
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">-- בחר עיר --</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Branch */}
            <div className="flex-1 min-w-[160px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                סניף
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => handleBranchChange(e.target.value)}
                disabled={!selectedCity}
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">-- בחר סניף --</option>
                {filteredBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Course Type */}
            <div className="flex-1 min-w-[160px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                חוג
              </label>
              <select
                value={selectedCourseType}
                onChange={(e) => handleCourseTypeChange(e.target.value)}
                disabled={!selectedBranch || loadingCourses}
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">-- בחר חוג --</option>
                {courseTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Age */}
            <div className="flex-1 min-w-[160px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                גיל
              </label>
              <select
                value={selectedAge}
                onChange={(e) => setSelectedAge(e.target.value)}
                disabled={!selectedCourseType}
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">-- בחר גיל --</option>
                {ageOptions.map((age) => (
                  <option key={age} value={age}>
                    {ageLabel(age)}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
                  <TableRow>
                    <TableHead>שם החוג</TableHead>
                    <TableHead>תחום</TableHead>
                    <TableHead>סניף</TableHead>
                    <TableHead>טווח גילאים</TableHead>
                    <TableHead>מחיר חודשי</TableHead>
                    <TableHead>שיעורים שבועיים</TableHead>
                    <TableHead>ימים ושעות</TableHead>
                    <TableHead>פרטים</TableHead>
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
                              {registrationRows.has(course.id) ? (
                                <CourseRegistrationForm
                                  courseName={course.name}
                                  lessons={course.lessons ?? []}
                                  onBack={() => closeRegistration(course.id)}
                                  onComplete={(paymentUrl) => {
                                    if (paymentUrl) {
                                      window.location.href = paymentUrl;
                                    } else {
                                      closeRegistration(course.id);
                                    }
                                  }}
                                />
                              ) : (
                                <div className="grid grid-cols-3 gap-4">
                                  {/* Instructor */}
                                  <div className="border rounded-lg p-4 bg-white min-h-[80px]">
                                    <p className="text-xs font-medium text-gray-500 mb-1">מדריך</p>
                                    {course.lessons?.length ? (
                                      Array.from(new Set(course.lessons.map((l) => l.instructor_name).filter(Boolean))).map((name) => (
                                        <p key={name} className="text-sm">{name}</p>
                                      ))
                                    ) : (
                                      <p className="text-sm text-gray-400">—</p>
                                    )}
                                  </div>
                                  {/* Days & hours */}
                                  <div className="border rounded-lg p-4 bg-white min-h-[80px]">
                                    <p className="text-xs font-medium text-gray-500 mb-1">ימים ושעות</p>
                                    {course.lessons?.length ? (
                                      course.lessons.map((l, i) => (
                                        <p key={i} className="text-sm">{getDayName(l.day_of_week)} {formatTimeRange(l.start_time, l.end_time)}</p>
                                      ))
                                    ) : (
                                      <p className="text-sm text-gray-400">—</p>
                                    )}
                                  </div>
                                  {/* Price & registration */}
                                  <div className="border rounded-lg p-4 bg-white min-h-[80px] flex flex-col gap-2">
                                    <p className="text-sm font-medium">
                                      {course.price != null ? `₪${course.price} לחודש` : '—'}
                                    </p>
                                    <button
                                      onClick={() => openRegistration(course.id)}
                                      className="w-full rounded-md bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-700"
                                    >
                                      הירשם לחוג
                                    </button>
                                    <button className="w-full rounded-md border border-teal-600 px-3 py-1.5 text-sm text-teal-600 hover:bg-teal-50">
                                      הירשם לשיעור ניסיון
                                    </button>
                                  </div>
                                </div>
                              )}
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
      </div>
  );
}
