import type { ClientTypeOption, DocumentTypeOption, StepDefinition } from './types';

export const WIZARD_STEPS: StepDefinition[] = [
  { step: 1, label: 'סוג לקוח' },
  { step: 2, label: 'סוג מסמך' },
  { step: 3, label: 'פרטי מסמך' },
  { step: 4, label: 'סיכום' },
];

export const CLIENT_TYPE_OPTIONS: ClientTypeOption[] = [
  { type: 'business', title: 'לקוח עסקי', description: 'הופעות, מותגים, ספקים' },
  { type: 'existing', title: 'לקוח קיים', description: 'חוגים, תלמידים קיימים' },
];

export const DOCUMENT_TYPE_OPTIONS: DocumentTypeOption[] = [
  { type: 'חשבונית מס/קבלה', description: 'מסמך חיוב וקבלת תשלום במסמך אחד' },
  { type: 'חשבונית עסקה', description: 'מסמך עסקה ללא אישור תשלום' },
  { type: 'טיוטה', description: 'מסמך לעריכה ובדיקה לפני הפקה סופית' },
];
