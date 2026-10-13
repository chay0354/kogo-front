import { describe, expect, test } from 'vitest';

import { CUSTOMER_CARD_LABEL, customerCardHref, customerCardOf, customerCardPath } from './customerCard';

/** Owner, 13.10.2026: "בלחיצת כפתור אני יכול לעבור לכרטיס הלקוח". Every id here is invented. */
describe('"לכרטיס הלקוח": where it leads', () => {
  test('the words of the button, wherever it stands', () => {
    expect(CUSTOMER_CARD_LABEL).toBe('לכרטיס הלקוח');
  });

  test('somebody Kogo knows: the card of the first child of the family — the address the customers section opens a card by', () => {
    expect(customerCardHref({ family_id: 'f-1', child_ids: ['c-9', 'c-4'] })).toBe('/customers?child=c-9');
    expect(customerCardHref({ family_id: 12, child_ids: [77] })).toBe('/customers?child=77');
  });

  test('an id is written safely into the address', () => {
    expect(customerCardHref({ family_id: 'f', child_ids: ['a b&c'] })).toBe('/customers?child=a%20b%26c');
  });

  test('nobody identified: no address — and so no button, rather than a locked one', () => {
    expect(customerCardHref(null)).toBeNull();
    expect(customerCardHref(undefined)).toBeNull();
    expect(customerCardHref({ family_id: null, child_ids: [] })).toBeNull();
    expect(customerCardHref({ family_id: '', child_ids: ['c-1'] })).toBeNull();
    // Children without a family are not an identification either.
    expect(customerCardHref({ child_ids: ['c-1'] })).toBeNull();
  });

  test('a family with no child to open has no card: the whole list of customers is not an answer', () => {
    expect(customerCardHref({ family_id: 'f-1', child_ids: [] })).toBeNull();
    expect(customerCardHref({ family_id: 'f-1' })).toBeNull();
    expect(customerCardHref({ family_id: 'f-1', child_ids: [null, '', '  '] })).toBeNull();
    // The first id that can be read is the one used.
    expect(customerCardHref({ family_id: 'f-1', child_ids: [null, '', 'c-3'] })).toBe('/customers?child=c-3');
  });

  test('a path the server sent ready is kept only when it names a card', () => {
    expect(customerCardPath('/customers?child=77')).toBe('/customers?child=77');
    expect(customerCardPath('/customers?tab=all&child=77')).toBe('/customers?tab=all&child=77');
    expect(customerCardPath('/customers')).toBeNull();
    expect(customerCardPath('/customers?child=')).toBeNull();
    expect(customerCardPath('/invoices?child=77')).toBeNull();
    expect(customerCardPath('https://elsewhere.example/customers?child=77')).toBeNull();
    expect(customerCardPath('')).toBeNull();
    expect(customerCardPath(null)).toBeNull();
  });

  test('whatever a row says of the customer — a ready path, a block, or the bare ids — the first that names a card wins', () => {
    expect(customerCardOf('/customers?child=5')).toBe('/customers?child=5');
    expect(customerCardOf({ link: '/customers?child=5' })).toBe('/customers?child=5');
    expect(customerCardOf({ customer_link: '/customers?child=8', family_id: 'f', child_ids: ['c-1'] })).toBe('/customers?child=8');
    // "/customers" alone is the list: the ids beside it are then what is read.
    expect(customerCardOf({ link: '/customers', family_id: 'f', child_ids: ['c-1'] })).toBe('/customers?child=c-1');
    expect(customerCardOf({ family_id: 'f', child_ids: ['c-2'] })).toBe('/customers?child=c-2');
    expect(customerCardOf({ link: '/customers', family_id: 'f', child_ids: [] })).toBeNull();
    expect(customerCardOf({ family_id: null })).toBeNull();
    expect(customerCardOf(null)).toBeNull();
    expect(customerCardOf(['/customers?child=5'])).toBeNull();
    expect(customerCardOf(7)).toBeNull();
  });
});
