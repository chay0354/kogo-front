import type { ClientTypeOption, DocumentTypeOption, StepDefinition } from './types';

export const ALL_WIZARD_STEPS: StepDefinition[] = [
  { id: 'clientType', label: 'סוג לקוח' },
  { id: 'selectCustomer', label: 'בחירת לקוח' },
  { id: 'docType', label: 'סוג מסמך' },
  { id: 'documentDetails', label: 'פרטי מסמך' },
  { id: 'summary', label: 'סיכום' },
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
