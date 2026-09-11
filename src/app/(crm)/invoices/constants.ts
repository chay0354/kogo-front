export const CHARGE_KIND_OPTIONS = [
  { value: 'standing_order', label: 'הוראת קבע' },
  { value: 'registration', label: 'הרשמה / דמי רישום' },
  { value: 'trial', label: 'שיעור ניסיון' },
  { value: 'store', label: 'חנות' },
  { value: 'one_time', label: 'חד-פעמי' },
] as const;

/** מסנן הסניף: הזמנות אתר אינן שייכות לאף סניף, ולכן הן ערך משלהן. */
export const DELIVERY_FILTER = 'delivery';

export const ORIGIN_OPTIONS = [
  { value: 'store_website', label: 'חנות · אתר' },
  { value: 'store_counter', label: 'חנות · סניף' },
  { value: 'subscription', label: 'מנוי' },
  { value: 'manual', label: 'מסמך ידני' },
] as const;

/** כמה ימים אחורה נטען הדף כשנפתח — החודש האחרון. */
export const DEFAULT_RANGE_DAYS = 30;

/**
 * מסנן העסק. שלושת הערכים הראשונים קבועים — כל ההכנסות, מה שהסניפים הכניסו
 * בעצמם, והחנות — ואחריהם בא כל עסק שהכנסות מתויגות אליו, לפי המזהה שלו.
 */
export const LEDGER_BUSINESS_ALL = '';
export const LEDGER_BUSINESS_BRANCHES = 'branches';
export const LEDGER_BUSINESS_STORE = 'store';

export const LEDGER_BUSINESS_FIXED_OPTIONS = [
  { value: LEDGER_BUSINESS_ALL, label: 'כל ההכנסות' },
  { value: LEDGER_BUSINESS_BRANCHES, label: 'סניפים' },
  { value: LEDGER_BUSINESS_STORE, label: 'חנות' },
] as const;

/** השדות של לשונית המסמכים עצמה. סוג המסמך מסונן לפי השם, כפי שהטבלה מציגה אותו. */
export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'חשבונית מס/קבלה', label: 'חשבונית מס/קבלה' },
  { value: 'חשבונית מס', label: 'חשבונית מס' },
  { value: 'קבלה', label: 'קבלה' },
  { value: 'חשבונית עסקה', label: 'חשבונית עסקה' },
  { value: 'חשבונית מס זיכוי', label: 'חשבונית מס זיכוי' },
] as const;

export const DOCUMENT_STATUS_OPTIONS = [
  { value: 'completed', label: 'שולם' },
  { value: 'pending', label: 'פתוח' },
  { value: 'partially_paid', label: 'שולם חלקית' },
  { value: 'failed', label: 'נכשל' },
  { value: 'refunded', label: 'זוכה' },
  { value: 'draft', label: 'טיוטה' },
] as const;
