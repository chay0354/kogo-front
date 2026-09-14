/**
 * Turn a DRF error body into one readable Hebrew line.
 *
 * The store dialogs used to print the raw response — a staff member clearing
 * the category field got `{"category":["This field may not be blank."]}` in a
 * Hebrew toast, which says nothing about what to do. Field names and DRF's
 * stock messages are named here; anything unrecognised is passed through as
 * written, so a Hebrew message from our own serializers still reads correctly.
 */

/** The category a product falls back to when the field is left empty. */
export const DEFAULT_CATEGORY = 'כללי';

const FIELD_LABELS: Record<string, string> = {
  name: 'שם המוצר',
  category: 'קטגוריה',
  size: 'מידות',
  cost_price: 'מחיר עלות',
  sale_price: 'מחיר מכירה',
  delivery_price: 'מחיר משלוח',
  branch: 'מיקום',
  stock_quantity: 'כמות במלאי',
  min_stock_alert: 'התראת מלאי מינימום',
  image_url: 'תמונה',
  notes: 'הערות',
  size_stocks: 'שורות המלאי',
};

const MESSAGE_TRANSLATIONS: Array<[RegExp, string | ((m: RegExpMatchArray) => string)]> = [
  [/^This field may not be blank\.?$/i, 'אי אפשר להשאיר ריק'],
  [/^This field may not be null\.?$/i, 'שדה חובה'],
  [/^This field is required\.?$/i, 'שדה חובה'],
  [/^A valid number is required\.?$/i, 'נדרש מספר תקין'],
  [/^A valid integer is required\.?$/i, 'נדרש מספר שלם'],
  [/^Enter a valid URL\.?$/i, 'כתובת לא תקינה'],
  [
    /^Ensure this field has no more than (\d+) characters\.?$/i,
    (m) => `עד ${m[1]} תווים`,
  ],
  [
    /^Ensure this value is greater than or equal to (\S+)\.?$/i,
    (m) => `הערך חייב להיות ${m[1]} ומעלה`,
  ],
];

function translate(message: string): string {
  for (const [pattern, replacement] of MESSAGE_TRANSLATIONS) {
    const match = message.match(pattern);
    if (match) return typeof replacement === 'string' ? replacement : replacement(match);
  }
  return message;
}

function flatten(value: unknown): string {
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, inner]) => describeField(key, inner))
      .filter(Boolean)
      .join('\n');
  }
  return translate(String(value ?? '').trim());
}

function describeField(field: string, value: unknown): string {
  const text = flatten(value);
  if (!text) return '';
  // Serializer-wide errors have no field to name.
  if (field === 'non_field_errors' || field === 'detail' || field === 'error') return text;
  const label = FIELD_LABELS[field] ?? field;
  return `${label}: ${text}`;
}

/**
 * `data` is the response body (`error.response.data`); `error` the axios error,
 * used only for its message when the body says nothing useful.
 */
export function describeApiError(data: unknown, error?: { message?: string }): string {
  if (typeof data === 'string' && data.trim()) return translate(data.trim());
  if (data && typeof data === 'object') {
    const described = flatten(data);
    if (described) return described;
  }
  return error?.message || 'שגיאה לא ידועה';
}
