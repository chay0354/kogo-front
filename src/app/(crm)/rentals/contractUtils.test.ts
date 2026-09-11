/**
 * The contract's rules on the tenants screen: what the contract column shows
 * for each state of the version on file, what the office is asked before a
 * new version replaces one, what the tenancy dialog says after a save, how
 * the history reads, and what a saved PDF is called.
 */
import { describe, expect, it } from 'vitest';
import type { RentalContract, TenancyContractSummary } from '@/lib/rentalsApi';
import {
  contractCell,
  contractFileName,
  contractHistoryRow,
  contractNoticeAfterSave,
  contractStatusLabel,
  contractStatusTone,
  contractVersionLabel,
  currentContractOf,
  formatDateTime,
  isUnsignedContract,
  issueConfirmMessage,
  issuedMessage,
  sortContracts,
  staleContractTitle,
} from './contractUtils';

function summary(overrides: Partial<TenancyContractSummary> = {}): TenancyContractSummary {
  return {
    id: 'k-2',
    version: 2,
    status: 'draft',
    status_label: 'טיוטה',
    created_at: '2026-09-11T14:05:00+03:00',
    is_stale: false,
    ...overrides,
  };
}

function contract(overrides: Partial<RentalContract> = {}): RentalContract {
  return {
    id: 'k-2',
    version: 2,
    status: 'draft',
    status_label: 'טיוטה',
    created_at: '2026-09-11T14:05:00+03:00',
    created_by_name: 'דנה כהן',
    voided_at: null,
    void_reason: null,
    terms_sha256: 'a'.repeat(64),
    pdf_url: '/api/v1/rentals/contracts/k-2/pdf/',
    ...overrides,
  };
}

const STALE_UNSIGNED = 'ההסכם השתנה אחרי שגרסה 2 הופקה, והחוזה לא מתעדכן מעצמו. כדי שיתאים להסכם, הפיקו גרסה חדשה.';
const STALE_SIGNED = 'ההסכם השתנה אחרי שגרסה 2 הופקה, והחוזה לא מתעדכן מעצמו. החוזה החתום נשאר כפי שנחתם.';

describe('statuses', () => {
  it("names a status by the server's label, else its own, else as it came", () => {
    expect(contractStatusLabel('sent', 'נשלח לשוכר')).toBe('נשלח לשוכר');
    expect(['draft', 'sent', 'viewed', 'signed', 'void'].map((status) => contractStatusLabel(status, ''))).toEqual([
      'טיוטה',
      'נשלח לחתימה',
      'נצפה',
      'נחתם',
      'בוטל',
    ]);
    expect(contractStatusLabel('expired', null)).toBe('expired');
    expect(contractStatusLabel('', null)).toBe('—');
  });

  it("colours them as the tenancy's chips do", () => {
    expect(['draft', 'sent', 'viewed', 'signed', 'void', 'expired'].map(contractStatusTone)).toEqual([
      'off',
      'progress',
      'progress',
      'signed',
      'bad',
      'off',
    ]);
  });

  it('counts every version neither signed nor void as unsigned', () => {
    expect(['draft', 'sent', 'viewed', 'expired'].map((status) => isUnsignedContract({ status }))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(['signed', 'void'].map((status) => isUnsignedContract({ status }))).toEqual([false, false]);
    expect(isUnsignedContract(null)).toBe(false);
  });

  it('numbers a version, and says only "גרסה" without a number', () => {
    expect(contractVersionLabel(3)).toBe('גרסה 3');
    expect([0, -1, 1.5, null, undefined].map((version) => contractVersionLabel(version))).toEqual([
      'גרסה',
      'גרסה',
      'גרסה',
      'גרסה',
      'גרסה',
    ]);
  });
});

describe('the contract column', () => {
  it('offers the first version when there is none', () => {
    expect(contractCell(null)).toEqual({ state: 'none' });
    expect(contractCell(undefined)).toEqual({ state: 'none' });
  });

  it('takes a void version on the row for none in force', () => {
    expect(contractCell(summary({ status: 'void', status_label: 'בוטל' }))).toEqual({ state: 'none' });
  });

  it('shows a draft by its status and number, with a new version allowed', () => {
    expect(contractCell(summary())).toEqual({
      state: 'draft',
      contractId: 'k-2',
      version: 2,
      versionLabel: 'גרסה 2',
      statusLabel: 'טיוטה',
      tone: 'off',
      stale: false,
      staleTitle: '',
      replaceable: true,
    });
  });

  it('shows a version out with the tenant as waiting on them', () => {
    expect(contractCell(summary({ status: 'sent', status_label: '' }))).toMatchObject({
      state: 'sent',
      statusLabel: 'נשלח לחתימה',
      tone: 'progress',
      replaceable: true,
    });
    expect(contractCell(summary({ status: 'viewed', status_label: '' }))).toMatchObject({
      state: 'viewed',
      statusLabel: 'נצפה',
      tone: 'progress',
      replaceable: true,
    });
  });

  it('marks a stale unsigned version, and says to issue a new one', () => {
    expect(contractCell(summary({ status: 'sent', is_stale: true }))).toMatchObject({
      state: 'sent',
      stale: true,
      staleTitle: STALE_UNSIGNED,
      replaceable: true,
    });
  });

  it('never offers to replace a signed version, and says a stale one stays as it was signed', () => {
    expect(contractCell(summary({ status: 'signed', status_label: 'נחתם' }))).toMatchObject({
      state: 'signed',
      tone: 'signed',
      stale: false,
      staleTitle: '',
      replaceable: false,
    });
    expect(contractCell(summary({ status: 'signed', status_label: 'נחתם', is_stale: true }))).toMatchObject({
      state: 'signed',
      stale: true,
      staleTitle: STALE_SIGNED,
      replaceable: false,
    });
  });

  it("keeps a status it does not know, in the server's words", () => {
    expect(contractCell(summary({ status: 'expired' as never, status_label: 'פג תוקף' }))).toMatchObject({
      state: 'other',
      statusLabel: 'פג תוקף',
      tone: 'off',
      replaceable: true,
    });
  });

  it('explains the stale chip only when the version is stale', () => {
    expect(staleContractTitle(summary())).toBe('');
    expect(staleContractTitle(null)).toBe('');
    expect(staleContractTitle(summary({ is_stale: true }))).toBe(STALE_UNSIGNED);
  });
});

describe('issuing a new version', () => {
  it('asks before replacing a version not yet signed', () => {
    expect(issueConfirmMessage(summary())).toBe('גרסה חדשה תחליף את גרסה 2 שעדיין לא נחתמה');
    expect(issueConfirmMessage(summary({ status: 'viewed', version: 4, is_stale: true }))).toBe(
      'גרסה חדשה תחליף את גרסה 4 שעדיין לא נחתמה',
    );
  });

  it('issues without asking when nothing would be replaced', () => {
    expect(issueConfirmMessage(null)).toBe('');
    expect(issueConfirmMessage(summary({ status: 'void' }))).toBe('');
    expect(issueConfirmMessage(summary({ status: 'signed' }))).toBe('');
  });

  it('names the version issued, and the unsigned one it replaced', () => {
    expect(issuedMessage({ version: 1 }, null)).toBe('החוזה הופק — גרסה 1');
    expect(issuedMessage({ version: 3 }, summary({ version: 2 }))).toBe('גרסה 3 הופקה, וגרסה 2 בוטלה');
    expect(issuedMessage({ version: 3 }, summary({ version: 2, status: 'signed' }))).toBe('החוזה הופק — גרסה 3');
    expect(issuedMessage(null, summary())).toBe('החוזה הופק');
  });
});

describe('after the tenancy dialog saves', () => {
  it('says so when the unsigned version on file no longer matches', () => {
    expect(contractNoticeAfterSave(summary({ is_stale: true }))).toBe(
      'החוזה הנוכחי (גרסה 2) לא מתעדכן מעצמו — הפיקו גרסה חדשה',
    );
    expect(contractNoticeAfterSave(summary({ status: 'sent', version: 5, is_stale: true }))).toBe(
      'החוזה הנוכחי (גרסה 5) לא מתעדכן מעצמו — הפיקו גרסה חדשה',
    );
  });

  it('says nothing when the version still matches, when there is none, or when it is signed', () => {
    expect(contractNoticeAfterSave(summary())).toBe('');
    expect(contractNoticeAfterSave(null)).toBe('');
    expect(contractNoticeAfterSave(summary({ status: 'signed', is_stale: true }))).toBe('');
  });
});

describe('the history', () => {
  it('writes a time as it was in Israel, whatever zone it came in', () => {
    expect(formatDateTime('2026-09-11T14:05:00+03:00')).toBe('11.9.2026, 14:05');
    expect(formatDateTime('2026-09-11T11:05:00Z')).toBe('11.9.2026, 14:05');
    // Winter is UTC+2, and the office's day can already be the next one.
    expect(formatDateTime('2026-01-15T22:30:00Z')).toBe('16.1.2026, 00:30');
  });

  it('gives nothing for a missing or unreadable time', () => {
    expect([null, undefined, '', 'soon'].map((value) => formatDateTime(value))).toEqual(['', '', '', '']);
  });

  it('reads an unsigned version: when, by whom, and that it can be voided', () => {
    expect(contractHistoryRow(contract())).toEqual({
      id: 'k-2',
      title: 'גרסה 2',
      statusLabel: 'טיוטה',
      tone: 'off',
      issued: 'הופקה ב־11.9.2026, 14:05',
      issuedBy: 'על ידי דנה כהן',
      voided: '',
      voidReason: '',
      isVoid: false,
      canVoid: true,
    });
  });

  it('reads a void version with when and why', () => {
    const row = contractHistoryRow(
      contract({
        status: 'void',
        status_label: 'בוטל',
        voided_at: '2026-09-12T10:00:00+03:00',
        void_reason: ' הוחלפה בגרסה 3 ',
      }),
    );
    expect(row).toMatchObject({
      statusLabel: 'בוטל',
      tone: 'bad',
      voided: 'בוטלה ב־12.9.2026, 10:00',
      voidReason: 'הוחלפה בגרסה 3',
      isVoid: true,
      canVoid: false,
    });
  });

  it('reads a void version without a time or a reason, and a version nobody is named for', () => {
    expect(contractHistoryRow(contract({ status: 'void', voided_at: null, void_reason: null }))).toMatchObject({
      voided: 'בוטלה',
      voidReason: '',
    });
    expect(contractHistoryRow(contract({ created_by_name: null })).issuedBy).toBe('');
    expect(contractHistoryRow(contract({ created_by_name: '  ' })).issuedBy).toBe('');
  });

  it('offers "בטל" on unsigned versions only, and keeps no reason on one not void', () => {
    const statuses: RentalContract['status'][] = ['draft', 'sent', 'viewed', 'signed', 'void'];
    expect(statuses.map((status) => contractHistoryRow(contract({ status })).canVoid)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(contractHistoryRow(contract({ void_reason: 'x' })).voidReason).toBe('');
  });

  it('lists the newest version first, and finds the one in force', () => {
    const list = [
      contract({ id: 'k-1', version: 1, status: 'void' }),
      contract({ id: 'k-3', version: 3, status: 'draft' }),
      contract({ id: 'k-2', version: 2, status: 'void' }),
    ];
    expect(sortContracts(list).map((item) => item.id)).toEqual(['k-3', 'k-2', 'k-1']);
    expect(list[0].id).toBe('k-1');
    expect(currentContractOf(list)?.id).toBe('k-3');
    expect(currentContractOf([contract({ id: 'k-1', version: 1, status: 'signed' }), contract({ status: 'void' })])?.id).toBe(
      'k-1',
    );
    expect(currentContractOf([contract({ status: 'void' })])).toBeNull();
    expect(currentContractOf([])).toBeNull();
  });
});

describe('the saved file', () => {
  it('is named for the tenant and the version', () => {
    expect(contractFileName({ tenantName: 'דנה לוי', version: 2 })).toBe('חוזה שכירות - דנה לוי - גרסה 2.pdf');
  });

  it('says a void version is void', () => {
    expect(contractFileName({ tenantName: 'דנה לוי', version: 1, voided: true })).toBe(
      'חוזה שכירות - דנה לוי - גרסה 1 (מבוטלת).pdf',
    );
  });

  it('says the signed copy is signed, so it is never taken for the unsigned PDF', () => {
    expect(contractFileName({ tenantName: 'דנה לוי', version: 2, signed: true })).toBe(
      'חוזה שכירות - דנה לוי - גרסה 2 (חתום).pdf',
    );
    expect(contractFileName({ tenantName: 'סטודיו "אור"', version: 3, signed: true })).toBe(
      'חוזה שכירות - סטודיו אור - גרסה 3 (חתום).pdf',
    );
  });

  it('drops what a file name cannot hold, and keeps the Hebrew punctuation', () => {
    expect(contractFileName({ tenantName: 'סטודיו "אור" / בע״מ: 3', version: 2 })).toBe(
      'חוזה שכירות - סטודיו אור בע״מ 3 - גרסה 2.pdf',
    );
    expect(contractFileName({ tenantName: '..hidden', version: 2 })).toBe('חוזה שכירות - hidden - גרסה 2.pdf');
  });

  it('drops control characters and the direction marks that could disguise a name', () => {
    const rightToLeftOverride = String.fromCharCode(0x202e);
    const nul = String.fromCharCode(0);
    const tab = String.fromCharCode(9);
    expect(contractFileName({ tenantName: `דנה${rightToLeftOverride}fdp.exe`, version: 2 })).toBe(
      'חוזה שכירות - דנה fdp.exe - גרסה 2.pdf',
    );
    expect(contractFileName({ tenantName: `דנה${nul}${tab}לוי`, version: 2 })).toBe('חוזה שכירות - דנה לוי - גרסה 2.pdf');
  });

  it('leaves the name out when there is none, and cuts a very long one', () => {
    expect(contractFileName({ tenantName: '', version: 2 })).toBe('חוזה שכירות - גרסה 2.pdf');
    expect(contractFileName({ tenantName: null, version: 2 })).toBe('חוזה שכירות - גרסה 2.pdf');
    expect(contractFileName({ tenantName: 'א'.repeat(200), version: 2 })).toBe(`חוזה שכירות - ${'א'.repeat(80)} - גרסה 2.pdf`);
  });
});
