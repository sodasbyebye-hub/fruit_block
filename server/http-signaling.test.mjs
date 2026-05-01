import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

const servers = new Set();

afterEach(async () => {
  await Promise.all([...servers].map(stopServer));
  servers.clear();
});

describe('HTTP signaling server', () => {
  it('creates a room, joins it, and exchanges WebRTC signals', async () => {
    const server = await startServer();
    const created = await post(server.port, { type: 'createRoom', clientId: 'host' });
    const code = created.messages[0].code;

    await post(server.port, {
      type: 'signal',
      code,
      clientId: 'host',
      signal: { type: 'offer', description: { type: 'offer', sdp: 'offer-sdp' } },
    });

    const joined = await post(server.port, { type: 'joinRoom', code: code.toLowerCase(), clientId: 'guest' });
    const guestPoll = await post(server.port, { type: 'poll', code, clientId: 'guest', after: joined.cursor });

    expect(joined.messages[0]).toMatchObject({ type: 'roomJoined', role: 'guest' });
    expect(guestPoll.messages).toContainEqual(
      expect.objectContaining({
        type: 'signal',
        signal: { type: 'offer', description: { type: 'offer', sdp: 'offer-sdp' } },
      }),
    );
  });
});

async function startServer() {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server/http-signaling.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, API_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const server = { child, port, stdout: '', stderr: '', exited: false };

  servers.add(server);
  child.stdout.on('data', (chunk) => {
    server.stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    server.stderr += String(chunk);
  });
  child.on('exit', () => {
    server.exited = true;
  });

  await waitForReady(server);
  return server;
}

async function post(port, body) {
  const response = await fetch(`http://127.0.0.1:${port}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  expect(response.ok).toBe(true);
  return response.json();
}

function waitForReady(server) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`HTTP signaling server did not start.\n${server.stderr}`));
    }, 3000);

    const checkReady = () => {
      if (server.stdout.includes('listening')) {
        cleanup();
        resolve();
      }
    };
    const checkExit = () => {
      cleanup();
      reject(new Error(`HTTP signaling server exited early.\n${server.stderr}`));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      server.child.stdout.off('data', checkReady);
      server.child.off('exit', checkExit);
    };

    server.child.stdout.on('data', checkReady);
    server.child.on('exit', checkExit);
    checkReady();
  });
}

async function stopServer(server) {
  if (server.exited) {
    return;
  }

  server.child.kill();
  await Promise.race([waitForExit(server), delay(1000)]);
}

function waitForExit(server) {
  if (server.exited) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    server.child.once('exit', resolve);
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;

      server.close(() => {
        if (port) {
          resolve(port);
          return;
        }

        reject(new Error('Could not allocate a test port'));
      });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
