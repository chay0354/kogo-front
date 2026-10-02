import { describe, expect, it } from 'vitest';
import { readIdentifyAnswer } from './identification';

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
