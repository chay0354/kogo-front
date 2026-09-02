export const MONTHS = [
  { value: 1, label: 'ינואר' },
  { value: 2, label: 'פברואר' },
  { value: 3, label: 'מרץ' },
  { value: 4, label: 'אפריל' },
  { value: 5, label: 'מאי' },
  { value: 6, label: 'יוני' },
  { value: 7, label: 'יולי' },
  { value: 8, label: 'אוגוסט' },
  { value: 9, label: 'ספטמבר' },
  { value: 10, label: 'אוקטובר' },
  { value: 11, label: 'נובמבר' },
  { value: 12, label: 'דצמבר' },
];

// Generate years from 2020 to current year + 1
const currentYear = new Date().getFullYear();
export const YEARS = Array.from({ length: currentYear - 2020 + 2 }, (_, i) => 2020 + i);

export interface MonthYearFilterState {
  month: number; // 1-12
  year: number;
  date_from: Date;
  date_to: Date;
}

export function getDefaultMonthYear(): { month: number; year: number } {
  const now = new Date();
  return {
    month: now.getMonth() + 1, // JavaScript months are 0-indexed
    year: now.getFullYear(),
  };
}

