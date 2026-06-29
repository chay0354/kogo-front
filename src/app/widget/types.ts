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
}

export interface CourseLesson {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  instructor_name: string | null;
}

export interface Course {
  id: string;
  name: string;
  course_type: string;
  course_type_name: string;
  course_type_description: string | null;
  branch_name: string;
  min_age: number | null;
  max_age: number | null;
  price: number | null;
  lessons_count: number;
  lessons: CourseLesson[];
}
