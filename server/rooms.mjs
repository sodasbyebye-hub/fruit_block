export const ROOM_CODE_PREFIX = 'JELLY';

export function createRoomCode(existingCodes = new Set(), random = Math.random) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const digits = Math.floor(1000 + random() * 9000);
    const code = `${ROOM_CODE_PREFIX}-${digits}`;
    if (!existingCodes.has(code)) {
      return code;
    }
  }

  throw new Error('Unable to create a unique room code');
}

export function createRoomStore(random = Math.random) {
  const rooms = new Map();

  function createRoom(host) {
    const code = createRoomCode(new Set(rooms.keys()), random);
    rooms.set(code, { code, host, guest: null });
    return rooms.get(code);
  }

  function joinRoom(code, guest) {
    const normalizedCode = normalizeRoomCode(code);
    const room = rooms.get(normalizedCode);

    if (!room) {
      return { ok: false, reason: 'not-found' };
    }

    if (room.guest) {
      return { ok: false, reason: 'full' };
    }

    if (room.host === guest) {
      return { ok: false, reason: 'self-join' };
    }

    room.guest = guest;
    return { ok: true, room };
  }

  function leave(client) {
    const affected = [];

    for (const [code, room] of rooms) {
      if (room.host === client || room.guest === client) {
        affected.push(room);
        rooms.delete(code);
      }
    }

    return affected;
  }

  function findPeer(code, client) {
    const room = rooms.get(normalizeRoomCode(code));
    if (!room) {
      return null;
    }

    if (room.host === client) {
      return room.guest;
    }

    if (room.guest === client) {
      return room.host;
    }

    return null;
  }

  return {
    rooms,
    createRoom,
    joinRoom,
    leave,
    findPeer,
  };
}

export function normalizeRoomCode(code) {
  return String(code ?? '').trim().toUpperCase();
}
