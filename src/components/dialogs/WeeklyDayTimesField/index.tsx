'use client';

import { DAY_NAMES, type WeekDay } from '@/types/schedule';
import { TimePicker } from '@/components/ui/time-picker';
import styles from './index.module.css';

export type DayTimeValue = { start: string; end: string };

type WeeklyDayTimesFieldProps = {
  label: string;
  days: WeekDay[];
  checkedDays: number[];
  dayTimes: Record<number, DayTimeValue>;
  onToggleDay: (day: number) => void;
  onChangeDayTime: (day: number, field: 'start' | 'end', value: string) => void;
  helperText?: string;
};

export function WeeklyDayTimesField({
  label,
  days,
  checkedDays,
  dayTimes,
  onToggleDay,
  onChangeDayTime,
  helperText,
}: WeeklyDayTimesFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">
        {label} <span className="text-red-500">*</span>
      </label>
      <div className={styles.container}>
        {days.map((day) => {
          const checked = checkedDays.includes(day);
          const time = dayTimes[day];
          return (
            <div key={day} className={styles.row}>
              <label
                className={`${styles.dayCheckboxLabel} ${checked ? '' : styles.dayCheckboxLabelUnchecked}`}
              >
                <input
                  type="checkbox"
                  className={styles.dayCheckbox}
                  checked={checked}
                  onChange={() => onToggleDay(day)}
                />
                <span>{DAY_NAMES[day]}</span>
              </label>
              {checked && time && (
                <div
                  className={styles.dayTimes}
                  role="group"
                  aria-label={`שעות ליום ${DAY_NAMES[day]}`}
                >
                  <TimePicker
                    value={time.start}
                    onChange={(value) => onChangeDayTime(day, 'start', value)}
                    minuteStep={5}
                    minHour={6}
                    maxHour={23}
                    aria-label={`שעת התחלה ליום ${DAY_NAMES[day]}`}
                  />
                  <span className={styles.timeSeparator} aria-hidden="true">–</span>
                  <TimePicker
                    value={time.end}
                    onChange={(value) => onChangeDayTime(day, 'end', value)}
                    minuteStep={5}
                    minHour={6}
                    maxHour={23}
                    aria-label={`שעת סיום ליום ${DAY_NAMES[day]}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {helperText && <p className={styles.helperText}>{helperText}</p>}
    </div>
  );
}
