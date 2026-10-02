import { describe, expect, it } from 'vitest';
import { isMobilePhone, nextPairMove, pairHintError, readIdentifyAnswer } from './identification';

describe('isMobilePhone', () => {
  it('takes ten digits that start with 05, and nothing else', () => {
    expect(isMobilePhone('0541234567')).toBe(true);
    for (const phone of ['', '054123456', '05412345678', '0341234567', '054-1234567', '•••••••••7']) {
      expect(isMobilePhone(phone)).toBe(false);
    }
  });
});

describe('pairHintError', () => {
  it('is silent while the numbers are still being typed', () => {
    expect(pairHintError('11111111', false, '054123', false)).toBe('');
    expect(pairHintError('', false, '', false)).toBe('');
  });

  it('names a whole identity number that is wrong, before the phone', () => {
    expect(pairHintError('111111111', false, '0341234567', false)).toBe('מספר תעודת הזהות לא תקין');
  });

  it('names a whole phone that does not start with 05', () => {
    expect(pairHintError('111111118', true, '0341234567', false)).toBe('מספר נייד מתחיל ב־05');
  });

  it('is silent when both are good', () => {
    expect(pairHintError('111111118', true, '0541234567', true)).toBe('');
  });
});

describe('nextPairMove', () => {
  const whole = { idOk: true, phoneOk: true, key: '111111118|0541234567', lastKey: '', manualAwaitsPhone: false };

  it('asks about a whole pair once', () => {
    expect(nextPairMove(whole)).toBe('ask');
    expect(nextPairMove({ ...whole, lastKey: whole.key })).toBe('stay');
  });

  it('waits while either number is not whole', () => {
    expect(nextPairMove({ ...whole, idOk: false })).toBe('wait');
    expect(nextPairMove({ ...whole, phoneOk: false, lastKey: whole.key })).toBe('wait');
  });

  it('asks again when a number was changed, also after "I will fill it in myself"', () => {
    expect(nextPairMove({ ...whole, key: '111111118|0541234568', lastKey: whole.key })).toBe('ask');
  });

  it('keeps the form open while a phone that was the card\'s is typed, and does not ask about it', () => {
    expect(nextPairMove({ ...whole, phoneOk: false, manualAwaitsPhone: true })).toBe('stay');
    expect(nextPairMove({ ...whole, manualAwaitsPhone: true })).toBe('settle');
  });
});

describe('readIdentifyAnswer', () => {
  it('reads a known parent with the hidden details as the server sent them', () => {
    const answer = readIdentifyAnswer({
      status: 'known', token: 'tok', notice_sent: true,
      parent: { first_name: 'ד••••', last_name: 'כ••••', email: 'd•••••••••', phone: '•••••••••7' },
      children: [{ id: 'c1', first_name: 'מאיה', last_name: 'כ••••', id_number: '••••••••6', birth_date: '••/••/•••8', gender: 'female' }],
    });
    expect(answer).toEqual({
      status: 'known',
      parent: {
        token: 'tok', noticeSent: true, firstName: 'ד••••', lastName: 'כ••••', email: 'd•••••••••', phone: '•••••••••7',
        children: [{ id: 'c1', firstName: 'מאיה', lastName: 'כ••••', idNumber: '••••••••6', birthDate: '••/••/•••8', gender: 'female' }],
      },
    });
  });

  it('reads a similar phone as an offer with one digit', () => {
    expect(readIdentifyAnswer({ status: 'near', last_digit: '7', near_token: 'n' }))
      .toEqual({ status: 'near', lastDigit: '7', nearToken: 'n' });
  });

  it('treats anything else as not known', () => {
    for (const body of [null, undefined, {}, { status: 'unknown' }, { status: 'known' }, { status: 'near' }, 'x']) {
      expect(readIdentifyAnswer(body)).toEqual({ status: 'unknown' });
    }
  });

  it('drops a child without an id or a name, and an unknown gender', () => {
    const answer = readIdentifyAnswer({
      status: 'known', token: 'tok', parent: {},
      children: [{ id: '', first_name: 'א' }, { id: 'c2', first_name: '' }, { id: 'c3', first_name: 'נועה', gender: 'x' }],
    });
    expect(answer.status === 'known' && answer.parent.children).toEqual([
      { id: 'c3', firstName: 'נועה', lastName: '', idNumber: '', birthDate: '', gender: '' },
    ]);
  });
});
