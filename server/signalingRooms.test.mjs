import { describe, expect, it } from 'vitest';
import { createSignalRoomStore, SIGNAL_ROOM_TTL_MS } from './signalingRooms.mjs';

describe('signal room store', () => {
  it('creates rooms, lets one guest join, and rejects a second guest', () => {
    const store = createSignalRoomStore(() => 0.1234);
    const created = store.handle({ type: 'createRoom', clientId: 'host' });
    const code = created.body.messages[0].code;

    expect(created.body.messages[0]).toMatchObject({ type: 'roomCreated', code: 'JELLY-2110', role: 'host' });
    expect(store.handle({ type: 'joinRoom', code, clientId: 'guest' }).body.messages[0]).toMatchObject({
      type: 'roomJoined',
      role: 'guest',
    });
    expect(store.handle({ type: 'joinRoom', code, clientId: 'third' }).body.messages[0]).toMatchObject({
      type: 'roomError',
      message: 'Room is full',
    });
  });

  it('delivers stored host offers to a guest from cursor zero', () => {
    const store = createSignalRoomStore(() => 0.1234);
    const created = store.handle({ type: 'createRoom', clientId: 'host' });
    const code = created.body.messages[0].code;
    const offer = { type: 'offer', description: { type: 'offer', sdp: 'offer-sdp' } };

    store.handle({ type: 'signal', code, clientId: 'host', signal: offer });
    store.handle({ type: 'joinRoom', code, clientId: 'guest' });
    const polled = store.handle({ type: 'poll', code, clientId: 'guest', after: 0 });

    expect(polled.body.messages).toContainEqual(expect.objectContaining({ type: 'signal', signal: offer }));
  });

  it('targets signal events by role and advances cursors', () => {
    const store = createSignalRoomStore(() => 0.1234);
    const created = store.handle({ type: 'createRoom', clientId: 'host' });
    const code = created.body.messages[0].code;
    const answer = { type: 'answer', description: { type: 'answer', sdp: 'answer-sdp' } };

    store.handle({ type: 'joinRoom', code, clientId: 'guest' });
    store.handle({ type: 'signal', code, clientId: 'guest', signal: answer });

    const hostPoll = store.handle({ type: 'poll', code, clientId: 'host', after: 0 });
    const guestPoll = store.handle({ type: 'poll', code, clientId: 'guest', after: 0 });

    expect(hostPoll.body.messages).toEqual([
      expect.objectContaining({ type: 'peerJoined' }),
      expect.objectContaining({ type: 'signal', signal: answer }),
    ]);
    expect(guestPoll.body.messages).toEqual([]);
    expect(store.handle({ type: 'poll', code, clientId: 'host', after: hostPoll.body.cursor }).body.messages).toEqual([]);
  });

  it('expires inactive rooms', () => {
    let now = 1000;
    const store = createSignalRoomStore(() => 0.1234, () => now);
    const created = store.handle({ type: 'createRoom', clientId: 'host' });
    const code = created.body.messages[0].code;

    now += SIGNAL_ROOM_TTL_MS + 1;

    expect(store.handle({ type: 'joinRoom', code, clientId: 'guest' }).body.messages[0]).toMatchObject({
      type: 'roomError',
      message: 'Room not found',
    });
  });
});
