export interface City {
  id: string;
  name: string;
}

export interface Branch {
  id: string;
  name: string;
  city: string;
  city_name: string;
  is_external: boolean;
  external_link: string;
  course_types?: { id: string; name: string }[];
}

export interface CourseLesson {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  instructor_name: string | null;
  price?: string | null;
  lesson_date?: string | null;
  is_recurring?: boolean;
  enrolled_count?: number;
  capacity?: number | null;
  available_spots?: number | null;
  is_full?: boolean;
  price_options?: CourseLessonPriceOption[];
}

export interface CourseLessonPriceOption {
  id: string;
  display_title: string;
  monthly_price: string;
  min_age?: number | null;
  max_age?: number | null;
}

// A combined "twice a week" package of 2+ of this course's own lessons, sold at a discount.
export interface CourseBundleLesson {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  instructor_name?: string | null;
}

export interface CourseBundle {
  id: string;
  name: string;
  combined_price: number;
  lessons: CourseBundleLesson[];
  is_full?: boolean;
}

export interface Course {
  id: string;
  name: string;
  display_id: number;
  course_type: string;
  course_type_name: string;
  course_type_description: string | null;
  branch_name: string;
  min_age: number | null;
  max_age: number | null;
  price: number | null;
  is_adult: boolean;
  must_attend_all_lessons: boolean;
  trial_lesson_is_paid: boolean;
  trial_lesson_price: number | null;
  charge_standing_order_immediately?: boolean;
  external_link: string;
  lessons_count: number;
  lessons: CourseLesson[];
  bundles: CourseBundle[];
}
