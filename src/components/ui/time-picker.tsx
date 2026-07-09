'use client';

import * as React from 'react';
import {
  buildMinuteOptions,
  formatHourLabel,
  formatMinuteLabel,
  generateHourOptions,
  normalizeTimeValue,
} from '@/lib/timeUtils';

export interface TimePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  /** Minute increment — default 5 */
  minuteStep?: number;
  minHour?: number;
  maxHour?: number;
  className?: string;
  selectClassName?: string;
  'aria-label'?: string;
  /**
   * When true, an empty `value` renders both dropdowns blank (a "שעה"/"דקות"
   * placeholder option) instead of defaulting to a preselected time. Off by
   * default so existing consumers keep their current always-has-a-value
   * behavior; opt in per field where a blank starting state is wanted.
   */
  allowEmpty?: boolean;
}

export function TimePicker({
  id,
  value,
  onChange,
  disabled = false,
  required = false,
  minuteStep = 5,
  minHour = 6,
  maxHour = 23,
  className,
  selectClassName,
  'aria-label': ariaLabel,
  allowEmpty = false,
}: TimePickerProps) {
  const isEmpty = allowEmpty && !value;
  const normalized = normalizeTimeValue(value);
  const [hourValue, minuteValue] = normalized.split(':').map(Number);
  const hours = generateHourOptions(minHour, maxHour);
  const safeHour = hours.includes(hourValue) ? hourValue : hours[0] ?? 9;
  const minutes = buildMinuteOptions(minuteStep, minuteValue);
  const safeMinute = minutes.includes(minuteValue) ? minuteValue : minutes[0] ?? 0;

  const selectClasses = `flex h-10 min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-50 ${selectClassName || ''}`;

  const emitChange = (hour: number, minute: number) => {
    onChange(`${formatHourLabel(hour)}:${formatMinuteLabel(minute)}`);
  };

  const handleHourChange = (raw: string) => {
    if (raw === '') {
      onChange('');
      return;
    }
    emitChange(Number(raw), isEmpty ? minutes[0] ?? 0 : safeMinute);
  };

  const handleMinuteChange = (raw: string) => {
    if (raw === '') {
      onChange('');
      return;
    }
    emitChange(isEmpty ? hours[0] ?? safeHour : safeHour, Number(raw));
  };

  return (
    <div
      id={id}
      className={`flex items-center gap-2 ${className || ''}`}
      dir="ltr"
      aria-label={ariaLabel}
    >
      <select
        aria-label="שעה"
        value={isEmpty ? '' : safeHour}
        disabled={disabled}
        required={required}
        onChange={(event) => handleHourChange(event.target.value)}
        className={`${selectClasses} flex-[1.1]`}
      >
        {isEmpty && <option value="">שעה</option>}
        {hours.map((hour) => (
          <option key={hour} value={hour}>
            {formatHourLabel(hour)}
          </option>
        ))}
      </select>
      <span className="text-gray-500 font-semibold select-none" aria-hidden="true">
        :
      </span>
      <select
        aria-label="דקות"
        value={isEmpty ? '' : safeMinute}
        disabled={disabled}
        required={required}
        onChange={(event) => handleMinuteChange(event.target.value)}
        className={`${selectClasses} flex-1`}
      >
        {isEmpty && <option value="">דקות</option>}
        {minutes.map((minute) => (
          <option key={minute} value={minute}>
            {formatMinuteLabel(minute)}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface TimeFieldProps extends TimePickerProps {
  label: string;
  helperText?: string;
  labelClassName?: string;
  helperClassName?: string;
}

export function TimeField({
  label,
  helperText,
  labelClassName,
  helperClassName,
  id,
  required,
  ...pickerProps
}: TimeFieldProps) {
  const fieldId = id || `time-${label.replace(/\s+/g, '-')}`;

  return (
    <div>
      <label htmlFor={fieldId} className={labelClassName || 'block text-sm font-medium text-gray-700 mb-1'}>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <TimePicker id={fieldId} required={required} {...pickerProps} />
      {helperText ? (
        <p className={helperClassName || 'text-xs text-gray-500 mt-1'}>{helperText}</p>
      ) : null}
    </div>
  );
}
