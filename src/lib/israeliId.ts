const ID_INVALID = 'מספר ת.ז. אינו תקין';
const ID_FORMAT = 'תעודת זהות חייבת להכיל עד 9 ספרות';

/** Israeli ID check digit (Luhn / "אלגוריתם לוהן"). */
export function isValidIsraeliId(id: string): boolean {
  const digits = id.trim().replace(/\D/g, '');
  if (!digits || digits.length > 9) return false;

  const padded = digits.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let step = Number(padded[i]) * ((i % 2) + 1);
    if (step > 9) step -= 9;
    sum += step;
  }
  return sum % 10 === 0;
}

export function israeliIdFieldError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'תעודת זהות חובה';

  if (/\D/.test(trimmed.replace(/\s/g, ''))) {
    return 'יש להזין ספרות בלבד';
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length > 9) return ID_FORMAT;
  if (!isValidIsraeliId(digits)) return ID_INVALID;
  return null;
}

export function sanitizeIsraeliIdInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 9);
}
