'use client';

import { Lesson } from '@/types/schedule';
import { formatTime } from '@/lib/scheduleUtils';

type ScheduleLessonCardProps = {
  lesson: Lesson;
  onClick?: () => void;
  className?: string;
  showEnrollment?: boolean;
  showTime?: boolean;
  /** Shorter layout for weekly schedule columns */
  compact?: boolean;
  /** Adaptive density for time-grid slots (height-based) */
  gridSize?: 'xs' | 'sm' | 'md' | 'lg';
  /** Shown above title when multiple studios share the same day */
  studioLabel?: string;
  /** City/branch lines (weekly view hides these when a branch is already filtered) */
  showLocation?: boolean;
};

export default function ScheduleLessonCard({
  lesson,
  onClick,
  className = '',
  showEnrollment = true,
  showTime = true,
  compact = false,
  gridSize,
  studioLabel,
  showLocation = true,
}: ScheduleLessonCardProps) {
  const isCancelled = lesson.status === 'cancelled';
  const capacity = lesson.room_capacity || 20;
  const timeLabel = `${formatTime(lesson.start_time)}–${formatTime(lesson.end_time)}`;
  const titleLabel = [
    lesson.course_name,
    lesson.course_type_name,
    timeLabel,
    showEnrollment ? `${lesson.enrollment_count}/${capacity}` : null,
    lesson.branch_name,
  ]
    .filter(Boolean)
    .join(' · ');

  const interactiveProps = onClick
    ? {
        onClick,
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};

  const baseClassName = `rounded-md border border-primary/30 bg-primary/10 transition-all ${
    onClick ? 'cursor-pointer hover:shadow-md hover:border-primary/50' : ''
  } ${isCancelled ? 'opacity-50 line-through' : ''} ${className}`;

  if (compact) {
    if (gridSize === 'xs') {
      return (
        <div
          {...interactiveProps}
          title={titleLabel}
          className={`px-1.5 py-1 h-full min-h-0 flex items-center ${baseClassName}`}
        >
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold text-gray-900 truncate leading-tight">
              {lesson.course_name || lesson.course_type_name || '—'}
            </div>
          </div>
          {showEnrollment ? (
            <span className="shrink-0 mr-1 text-[9px] tabular-nums text-gray-500">
              {lesson.enrollment_count}/{capacity}
            </span>
          ) : null}
        </div>
      );
    }

    if (gridSize === 'sm') {
      return (
        <div
          {...interactiveProps}
          title={titleLabel}
          className={`px-2 py-1 h-full min-h-0 flex flex-col justify-center gap-0.5 ${baseClassName}`}
        >
          <div className="text-[10px] font-semibold text-gray-900 truncate leading-tight">
            {lesson.course_name || '—'}
          </div>
          <div className="flex items-center justify-between gap-1 min-w-0">
            <span className="text-[9px] text-gray-500 tabular-nums truncate">{timeLabel}</span>
            {showEnrollment ? (
              <span className="shrink-0 text-[9px] tabular-nums text-gray-500">
                {lesson.enrollment_count}/{capacity}
              </span>
            ) : null}
          </div>
        </div>
      );
    }

    if (gridSize === 'md') {
      const locationLabel = [lesson.city_name, lesson.branch_name].filter(Boolean).join(' · ');
      return (
        <div
          {...interactiveProps}
          title={titleLabel}
          className={`px-2 py-1.5 h-full min-h-0 flex flex-col ${baseClassName}`}
        >
          <div className="flex items-start justify-between gap-1 mb-0.5 min-w-0">
            {showLocation && locationLabel ? (
              <div className="text-[9px] text-gray-500 truncate" title={locationLabel}>
                {locationLabel}
              </div>
            ) : lesson.course_type_name ? (
              <div className="text-[9px] text-gray-500 truncate">{lesson.course_type_name}</div>
            ) : (
              <span />
            )}
            {showEnrollment ? (
              <span className="shrink-0 text-[9px] tabular-nums bg-gray-200/90 rounded px-1">
                {lesson.enrollment_count}/{capacity}
              </span>
            ) : null}
          </div>
          {showLocation && locationLabel && lesson.course_type_name ? (
            <div className="text-[9px] text-gray-500 truncate">{lesson.course_type_name}</div>
          ) : null}
          <div className="text-[10px] font-semibold text-gray-900 truncate leading-tight">
            {lesson.course_name || '—'}
          </div>
          <div className="mt-auto text-[9px] text-gray-500 tabular-nums">{timeLabel}</div>
        </div>
      );
    }

    return (
      <div {...interactiveProps} title={titleLabel} className={`px-2.5 py-2 h-full min-h-0 flex flex-col ${baseClassName}`}>
        {studioLabel || showEnrollment ? (
          <div className="flex items-center justify-between gap-1.5 mb-1.5 min-w-0">
            {studioLabel ? (
              <div
                className="text-[10px] font-medium text-primary/80 truncate min-w-0"
                title={studioLabel}
              >
                {studioLabel}
              </div>
            ) : (
              <span />
            )}
            {showEnrollment ? (
              <span className="shrink-0 inline-block px-1.5 py-0.5 bg-gray-200/90 rounded text-[10px] tabular-nums whitespace-nowrap">
                {lesson.enrollment_count}/{capacity}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-0.5">
          {showLocation && lesson.city_name ? (
            <div
              className="font-bold text-xs text-gray-900 leading-snug truncate"
              title={lesson.city_name}
            >
              {lesson.city_name}
            </div>
          ) : null}
          {showLocation && lesson.branch_name ? (
            <div className="text-[10px] text-gray-500 leading-snug truncate" title={lesson.branch_name}>
              {lesson.branch_name}
            </div>
          ) : null}
          {lesson.course_type_name ? (
            <div className="text-[11px] text-gray-600 leading-snug truncate" title={lesson.course_type_name}>
              {lesson.course_type_name}
            </div>
          ) : null}
          <div
            className="font-semibold text-xs text-gray-900 leading-snug line-clamp-2"
            title={lesson.course_name || undefined}
          >
            {lesson.course_name || '—'}
          </div>
        </div>

        {showTime ? (
          <div className="mt-auto pt-1 border-t border-primary/15 text-[10px] font-medium text-gray-600 tabular-nums whitespace-nowrap">
            {timeLabel}
          </div>
        ) : null}
        {isCancelled ? (
          <div className="mt-0.5 text-[10px] font-medium text-red-600">שיעור מבוטל</div>
        ) : null}
      </div>
    );
  }

  return (
    <div {...interactiveProps} className={`px-2 py-2 ${baseClassName}`}>
      <div className="font-semibold text-xs truncate text-gray-900 leading-snug">
        {lesson.city_name || '—'}
      </div>
      <div className="text-[11px] text-gray-600 truncate leading-snug mt-0.5">
        {lesson.branch_name || '—'}
      </div>
      <div className="text-[11px] text-gray-700 truncate leading-snug">
        {lesson.course_type_name || '—'}
      </div>
      <div className="text-xs font-medium text-gray-900 truncate leading-snug">
        {lesson.course_name || '—'}
      </div>
      {showTime && (
        <div className="text-[10px] text-gray-500 mt-1">
          {formatTime(lesson.start_time)}–{formatTime(lesson.end_time)}
        </div>
      )}
      {showEnrollment && (
        <div className="mt-1">
          <span className="inline-block px-1.5 py-0.5 bg-gray-200 rounded text-[10px]">
            {lesson.enrollment_count}/{capacity}
          </span>
        </div>
      )}
      {isCancelled && (
        <div className="mt-1 text-[10px] font-medium text-red-600">שיעור מבוטל</div>
      )}
    </div>
  );
}
