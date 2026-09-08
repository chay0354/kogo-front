/** The settings hub's categories — each is a route under /settings. */
export const SETTINGS_TABS = [
  { href: '/settings/users', label: 'משתמשים והרשאות', description: 'משתמשי המערכת, תפקידים, ושותפים לפי סניף' },
  { href: '/settings/finance', label: 'כספים', description: 'עסקים וקטגוריות להכנסות, והנחות' },
  { href: '/settings/payment-links', label: 'קישורי תשלום', description: 'קישור לתשלום בכרטיס לכל מטרה — הכסף נכנס תחת העסק והקטגוריה של הקישור' },
  { href: '/settings/billing', label: 'סליקה', description: 'בדיקות סליקת אשראי מול Tranzila' },
  { href: '/settings/whatsapp', label: 'הודעות', description: 'WhatsApp / ManyChat' },
  { href: '/settings/trials', label: 'שיעורי ניסיון', description: 'תאריכים שבהם לא נקבעים שיעורי ניסיון' },
  { href: '/settings/terms', label: 'תקנון', description: 'תקנון הרישום שמוצג בווידג\'ט ובטופס ההרשמה' },
  { href: '/settings/system', label: 'מערכת', description: 'חיבורים, אבחון מדריכים, ספר-מערכת' },
] as const;
