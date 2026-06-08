import { Lesson } from '@/types/schedule';
import { CurrentUser } from '@/lib/auth';
import ScheduleLessonCard from './ScheduleLessonCard';

type LessonCardProps = {
  lesson: Lesson;
  currentUser: CurrentUser | null;
  onViewDetails?: (lesson: Lesson) => void;
};

export default function LessonCard({
  lesson,
  currentUser: _currentUser,
  onViewDetails,
}: LessonCardProps) {
  return (
    <ScheduleLessonCard
      lesson={lesson}
      onClick={() => onViewDetails?.(lesson)}
      className="p-3 border-gray-200 hover:scale-[1.02]"
    />
  );
}
