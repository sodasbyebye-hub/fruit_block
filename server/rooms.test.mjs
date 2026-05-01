import { describe, expect, it } from 'vitest';
import { createRoomCode, createRoomStore, normalizeRoomCode } from './rooms.mjs';

describe('room store', () => {
  it('creates normalized short invite codes', () => {
    const code = createRoomCode(new Set(), () => 0.2345);
    expect(code).toMatch(/^JELLY-\d{4}$/);
    expect(normalizeRoomCode(' jelly-2110 ')).toBe('JELLY-2110');
  });

  it('creates and joins rooms', () => {
    const store = createRoomStore(() => 0.1234);
    const host = { id: 'host' };
    const guest = { id: 'guest' };
    const room = store.createRoom(host);
    const joined = store.joinRoom(room.code.toLowerCase(), guest);

    expect(room.code).toBe('JELLY-2110');
    expect(joined.ok).toBe(true);
    expect(store.findPeer(room.code, host)).toBe(guest);
    expect(store.findPeer(room.code, guest)).toBe(host);
  });

  it('rejects missing and full rooms', () => {
    const store = createRoomStore(() => 0.5);
    const room = store.createRoom({ id: 'host' });
    expect(store.joinRoom('JELLY-0000', { id: 'guest' })).toEqual({ ok: false, reason: 'not-found' });
    expect(store.joinRoom(room.code, { id: 'guest' }).ok).toBe(true);
    expect(store.joinRoom(room.code, { id: 'third' })).toEqual({ ok: false, reason: 'full' });
  });

  it('cleans up rooms when either peer leaves', () => {
    const store = createRoomStore(() => 0.75);
    const host = { id: 'host' };
    const guest = { id: 'guest' };
    const room = store.createRoom(host);
    store.joinRoom(room.code, guest);

    const affected = store.leave(guest);
    expect(affected).toHaveLength(1);
    expect(store.rooms.size).toBe(0);
  });
});
