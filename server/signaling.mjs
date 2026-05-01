import { WebSocketServer } from 'ws';
import { createRoomStore, normalizeRoomCode } from './rooms.mjs';

const port = Number(process.env.WS_PORT ?? 8787);
const rooms = createRoomStore();
const wss = new WebSocketServer({ port });

function send(client, message) {
  if (client?.readyState === client?.OPEN) {
    client.send(JSON.stringify(message));
  }
}

function sendError(client, message) {
  send(client, { type: 'roomError', message });
}

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let message;

    try {
      message = JSON.parse(String(raw));
    } catch {
      sendError(socket, 'Invalid message');
      return;
    }

    if (message.type === 'createRoom') {
      const room = rooms.createRoom(socket);
      send(socket, { type: 'roomCreated', code: room.code, role: 'host' });
      return;
    }

    if (message.type === 'joinRoom') {
      const code = normalizeRoomCode(message.code);
      const result = rooms.joinRoom(code, socket);

      if (!result.ok) {
        sendError(socket, result.reason === 'full' ? 'Room is full' : 'Room not found');
        return;
      }

      send(socket, { type: 'roomJoined', code: result.room.code, role: 'guest' });
      send(result.room.host, { type: 'peerJoined' });
      return;
    }

    if (message.type === 'relay') {
      const peer = rooms.findPeer(message.code, socket);

      if (!peer) {
        sendError(socket, 'Peer is not connected');
        return;
      }

      send(peer, { type: 'relay', payload: message.payload });
      return;
    }

    if (message.type === 'leaveRoom') {
      for (const room of rooms.leave(socket)) {
        send(room.host === socket ? room.guest : room.host, { type: 'peerLeft' });
      }
    }
  });

  socket.on('close', () => {
    for (const room of rooms.leave(socket)) {
      send(room.host === socket ? room.guest : room.host, { type: 'peerLeft' });
    }
  });
});

console.log(`Jelly Battle signaling server listening on ws://127.0.0.1:${port}`);
