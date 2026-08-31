export const INSTRUCTOR_MOTION_MS = {
  openLesson: 220,
  closeAttendance: 260,
  logout: 260,
  returnHome: 420,
} as const;

type MotionDelayOptions = {
  duration: number;
  reduceMotion: boolean;
  mobileOnly?: boolean;
  isMobile?: boolean;
};

export function resolveInstructorMotionDelay({
  duration,
  reduceMotion,
  mobileOnly = false,
  isMobile = true,
}: MotionDelayOptions): number {
  if (reduceMotion || (mobileOnly && !isMobile)) return 0;
  return duration;
}
