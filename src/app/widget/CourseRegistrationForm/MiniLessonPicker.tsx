'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import api from '@/lib/api';
import { AGE_OPTIONS, formatAge } from '@/lib/courseUtils';
import { CourseList } from '../CourseList/CourseList';
import { isCourseVisibleInWidgetCatalog } from '../lessonVisibility';
import { STATIC_CITIES } from '../page.utils';
import { selectionFromCatalogPick, type EnrollmentSelection } from '../catalogRows';
import { sortWidgetCourseTypes } from '../courseTypeOrder';
import type { Branch, Course, CourseBundle, CourseLesson, CourseLessonPriceOption } from '../types';
import { SkeletonCourseList, SkeletonFilterField } from '../WidgetSkeletons/WidgetSkeletons';
import styles from './MiniLessonPicker.module.css';

export interface WidgetFilterDefaults {
  city: string;
  branch: string;
  courseType: string;
  age: string;
}

interface MiniLessonPickerProps {
  defaultFilters: WidgetFilterDefaults;
  excludedSelectionKeys: Set<string>;
  onSelect: (selection: EnrollmentSelection) => void;
}

function MiniFilterField({
  label,
  value,
  onChange,
  disabled,
  loading,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  // Its own shape at its own size, so the grid holds still when the options land.
  if (loading) {
    return (
      <div className={styles.filterField}>
        <span className={styles.filterLabel}>{label}</span>
        <SkeletonFilterField compact />
      </div>
    );
  }

  return (
    <label className={styles.filterField}>
      <span className={styles.filterLabel}>{label}</span>
      <div className={`${styles.filterControl}${value ? ` ${styles.filterControlSelected}` : ''}`}>
        <select
          className={styles.filterSelect}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

export default function MiniLessonPicker({
  defaultFilters,
  excludedSelectionKeys,
  onSelect,
}: MiniLessonPickerProps) {
  const [selectedCity, setSelectedCity] = useState(defaultFilters.city);
  const [selectedBranch, setSelectedBranch] = useState(defaultFilters.branch);
  const [selectedCourseType, setSelectedCourseType] = useState(defaultFilters.courseType);
  const [selectedAge, setSelectedAge] = useState(defaultFilters.age);

  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [coursesByBranch, setCoursesByBranch] = useState<Record<string, Course[]>>({});
  const [courseTypesByBranch, setCourseTypesByBranch] = useState<Record<string, { id: string; name: string }[]>>({});
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingCourseTypes, setLoadingCourseTypes] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const loadedCourseTypesRef = useRef(new Set<string>());
  const loadedBranchCoursesRef = useRef(new Set<string>());

  useEffect(() => {
    setLoadingBranches(true);
    api.get('/customers/widget/branches/')
      .then((branchesRes) => {
        const branchesData: Branch[] = Array.isArray(branchesRes.data)
          ? branchesRes.data
          : branchesRes.data.results ?? [];
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
    const cityBranches = allBranches.filter((branch) => branch.city === selectedCity);
    const uniqueNames = new Set(cityBranches.map((branch) => branch.name.trim()));
    if (uniqueNames.size === 1 && cityBranches[0] && !selectedBranch) {
      setSelectedBranch(cityBranches[0].id);
    }
  }, [selectedCity, allBranches, selectedBranch]);

  const filteredBranches = useMemo(() => {
    if (!selectedCity) return [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    return allBranches.filter((branch) => {
      if (branch.city !== selectedCity) return false;
      const nameKey = branch.name.trim();
      if (seenIds.has(branch.id) || seenNames.has(nameKey)) return false;
      seenIds.add(branch.id);
      seenNames.add(nameKey);
      return true;
    });
  }, [allBranches, selectedCity]);

  const branchCourses = selectedBranch ? (coursesByBranch[selectedBranch] ?? []) : [];
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

  const showCourseList = Boolean(selectedCity && selectedBranch && selectedCourseType && selectedAge);
  const parsedAge = selectedAge ? parseInt(selectedAge, 10) : null;
  // Course types ride along with the branches, so both fields wait on that call.
  const branchesPending = loadingBranches && allBranches.length === 0;

  const handleCityChange = (cityId: string) => {
    setSelectedCity(cityId);
    setSelectedBranch('');
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

  const handleCourseSelect = (
    course: Course,
    bundle?: CourseBundle,
    lesson?: CourseLesson,
    priceOption?: CourseLessonPriceOption,
  ) => {
    onSelect(selectionFromCatalogPick(course, bundle ?? null, lesson ?? null, priceOption ?? null));
  };

  const activeField = !selectedCity ? 'city'
    : !selectedBranch ? 'branch'
      : !selectedCourseType ? 'courseType'
        : !selectedAge ? 'age'
          : null;

  return (
    <div className={styles.root}>
      <div className={styles.filterHeader}>
        <span className={styles.filterHeaderLine} />
        <span className={styles.filterHeaderText}>חיפוש חוג</span>
        <span className={styles.filterHeaderLine} />
      </div>

      <div className={styles.filterGrid}>
        <MiniFilterField
          label="עיר"
          value={selectedCity}
          onChange={handleCityChange}
          disabled={loadingBranches}
          placeholder="בחרו עיר"
          options={STATIC_CITIES.map((city) => ({ value: city.id, label: city.name }))}
        />
        <MiniFilterField
          label="סניף"
          value={selectedBranch}
          onChange={handleBranchChange}
          disabled={!selectedCity || loadingBranches}
          loading={branchesPending}
          placeholder="בחרו סניף"
          options={filteredBranches.map((branch) => ({ value: branch.id, label: branch.name }))}
        />
        <MiniFilterField
          label="חוג"
          value={selectedCourseType}
          onChange={handleCourseTypeChange}
          disabled={!selectedBranch || loadingCourseTypes}
          loading={branchesPending || (loadingCourseTypes && courseTypes.length === 0)}
          placeholder="בחרו חוג"
          options={courseTypes.map((type) => ({ value: type.id, label: type.name }))}
        />
        <MiniFilterField
          label="גיל"
          value={selectedAge}
          onChange={setSelectedAge}
          disabled={!selectedCourseType}
          placeholder="בחרו גיל"
          options={AGE_OPTIONS.map((age) => ({ value: String(age), label: formatAge(age) }))}
        />
      </div>

      {!showCourseList ? (
        <p className={styles.helperText}>
          {activeField === 'city' ? 'בחרו עיר כדי להתחיל'
            : activeField === 'branch' ? 'בחרו סניף'
              : activeField === 'courseType' ? 'בחרו סוג חוג'
                : activeField === 'age' ? 'בחרו גיל כדי לראות מפגשים'
                  : 'השלימו את הבחירות למעלה'}
        </p>
      ) : loadingCourses && branchCourses.length === 0 ? (
        <div className={styles.listWrap}>
          <SkeletonCourseList compact />
        </div>
      ) : filteredCourses.length === 0 ? (
        <p className={styles.helperText}>אין חוגים מתאימים לבחירה זו.</p>
      ) : (
        <div className={styles.listWrap}>
          <CourseList
            filteredCourses={filteredCourses}
            selectedAge={parsedAge}
            excludedSelectionKeys={excludedSelectionKeys}
            compact
            onSelect={handleCourseSelect}
          />
        </div>
      )}
    </div>
  );
}
