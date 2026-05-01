import { beforeEach, describe, expect, it } from 'vitest';
import roomsApi, { resetRoomsForTest } from './rooms';

describe('Vercel rooms API', () => {
  beforeEach(() => {
    resetRoomsForTest();
  });

  it('creates a room and lets a guest join by code', async () => {
    const created = await postRoom({ type: 'createRoom', clientId: 'host' });
    const code = created.body.messages[0].code;
    const joined = await postRoom({ type: 'joinRoom', code: code?.toLowerCase(), clientId: 'guest' });
    const hostPoll = await postRoom({ type: 'poll', code, after: 0, clientId: 'host' });

    expect(created.status).toBe(200);
    expect(created.body.messages[0]).toMatchObject({ type: 'roomCreated', role: 'host' });
    expect(joined.body.messages[0]).toMatchObject({ type: 'roomJoined', code, role: 'guest' });
    expect(hostPoll.body.messages).toEqual([{ type: 'peerJoined', eventId: 1 }]);
  });

  it('relays guest input to the host', async () => {
    const created = await postRoom({ type: 'createRoom', clientId: 'host' });
    const code = created.body.messages[0].code;

    await postRoom({ type: 'joinRoom', code, clientId: 'guest' });
    await postRoom({ type: 'poll', code, after: 0, clientId: 'host' });

    const relayed = await postRoom({
      type: 'relay',
      code,
      clientId: 'guest',
      payload: { type: 'guestInput', action: 'left' },
    });
    const hostPoll = await postRoom({ type: 'poll', code, after: 1, clientId: 'host' });

    expect(relayed.body).toEqual({ messages: [], cursor: 2 });
    expect(hostPoll.body.messages).toEqual([
      { type: 'relay', payload: { type: 'guestInput', action: 'left' }, eventId: 2 },
    ]);
  });

  it('rejects joining a missing room', async () => {
    const joined = await postRoom({ type: 'joinRoom', code: 'JELLY-0000', clientId: 'guest' });

    expect(joined.status).toBe(404);
    expect(joined.body.messages[0]).toMatchObject({ type: 'roomError', message: 'Room not found' });
  });
});

async function postRoom(body: unknown) {
  const response = await roomsApi.fetch(
    new Request('https://example.vercel.app/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

  return {
    status: response.status,
    body: (await response.json()) as {
      messages: Array<{ type: string; code?: string; role?: string; eventId?: number; message?: string; payload?: unknown }>;
      cursor?: number;
    },
  };
}
