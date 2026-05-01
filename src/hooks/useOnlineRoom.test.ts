import { describe, expect, it } from 'vitest';
import { resolveHttpCursor } from './useOnlineRoom';

describe('online room HTTP cursor', () => {
  it('advances to received event ids without using relay response cursors', () => {
    const cursor = resolveHttpCursor(
      1,
      {
        messages: [],
        cursor: 4,
      },
      false,
    );

    expect(cursor).toBe(1);
  });

  it('uses poll response cursors after processing visible messages', () => {
    const cursor = resolveHttpCursor(
      1,
      {
        messages: [{ type: 'relay', eventId: 3 }],
        cursor: 5,
      },
      true,
    );

    expect(cursor).toBe(5);
  });

  it('keeps relay messages that arrive in non-poll responses from being replayed', () => {
    const cursor = resolveHttpCursor(
      1,
      {
        messages: [{ type: 'relay', eventId: 2 }],
        cursor: 5,
      },
      false,
    );

    expect(cursor).toBe(2);
  });
});
