import { createServer } from 'node:http';
import { createSignalRoomStore } from './signalingRooms.mjs';

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 8787);
const store = createSignalRoomStore();

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    writeJson(response, 204, {});
    return;
  }

  if (request.method !== 'POST' || request.url !== '/api/rooms') {
    writeJson(response, 404, { messages: [{ type: 'roomError', message: 'Not found' }] });
    return;
  }

  let message;

  try {
    message = JSON.parse(await readBody(request));
  } catch {
    writeJson(response, 400, { messages: [{ type: 'roomError', message: 'Invalid message' }] });
    return;
  }

  const result = store.handle(message);
  writeJson(response, result.status, result.body);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Jelly Battle HTTP signaling server listening on port ${port}`);
});

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  });
  response.end(status === 204 ? undefined : JSON.stringify(body));
}
