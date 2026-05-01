import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

const servers = new Set();

afterEach(async () => {
  await Promise.all([...servers].map(stopSignalingServer));
  servers.clear();
});

describe('signaling server', () => {
  it('keeps running when a host leaves before a guest joins', async () => {
    const server = await startSignalingServer();
    const host = await openClient(server.port);

    try {
      host.send(JSON.stringify({ type: 'createRoom' }));
      const created = await readMessage(host);

      expect(created.type).toBe('roomCreated');

      host.send(JSON.stringify({ type: 'leaveRoom', code: created.code }));
      await expectServerStillRunning(server);
    } finally {
      host.close();
    }
  });

  it('keeps running when a host disconnects before a guest joins', async () => {
    const server = await startSignalingServer();
    const host = await openClient(server.port);

    host.send(JSON.stringify({ type: 'createRoom' }));
    const created = await readMessage(host);

    expect(created.type).toBe('roomCreated');

    host.close();
    await waitForClose(host);
    await expectServerStillRunning(server);
  });

  it('lets a guest join an existing room code', async () => {
    const server = await startSignalingServer();
    const host = await openClient(server.port);
    const guest = await openClient(server.port);

    try {
      host.send(JSON.stringify({ type: 'createRoom' }));
      const created = await readMessage(host);
      const peerJoined = readMessage(host);
      const roomJoined = readMessage(guest);

      guest.send(JSON.stringify({ type: 'joinRoom', code: created.code.toLowerCase() }));

      await expect(roomJoined).resolves.toMatchObject({
        type: 'roomJoined',
        code: created.code,
        role: 'guest',
      });
      await expect(peerJoined).resolves.toMatchObject({ type: 'peerJoined' });
      await expectServerStillRunning(server);
    } finally {
      guest.close();
      host.close();
    }
  });
});

async function startSignalingServer() {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server/signaling.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, WS_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const server = {
    child,
    port,
    stdout: '',
    stderr: '',
    exited: false,
    exitCode: null,
    signal: null,
  };

  servers.add(server);
  child.stdout.on('data', (chunk) => {
    server.stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    server.stderr += String(chunk);
  });
  child.on('exit', (code, signal) => {
    server.exited = true;
    server.exitCode = code;
    server.signal = signal;
  });

  await waitForServerReady(server);
  return server;
}

async function stopSignalingServer(server) {
  if (server.exited) {
    return;
  }

  server.child.kill();
  await Promise.race([waitForExit(server), delay(1000)]);
}

function waitForServerReady(server) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Signaling server did not start.\n${server.stderr}`));
    }, 3000);

    const checkReady = () => {
      if (server.stdout.includes('listening')) {
        cleanup();
        resolve();
      }
    };

    const checkExit = () => {
      cleanup();
      reject(new Error(`Signaling server exited early.\n${server.stderr}`));
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

async function expectServerStillRunning(server) {
  await delay(150);

  if (server.exited) {
    throw new Error(`Signaling server exited unexpectedly with ${server.exitCode ?? server.signal}.\n${server.stderr}`);
  }

  expect(server.child.exitCode).toBeNull();
}

function openClient(port) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('WebSocket client did not connect'));
    }, 3000);

    socket.once('open', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function readMessage(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WebSocket message'));
    }, 3000);

    const onMessage = (raw) => {
      cleanup();
      resolve(JSON.parse(String(raw)));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('WebSocket closed before message arrived'));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      socket.off('error', onError);
      socket.off('close', onClose);
    };

    socket.once('message', onMessage);
    socket.once('error', onError);
    socket.once('close', onClose);
  });
}

function waitForClose(socket) {
  if (socket.readyState === WebSocket.CLOSED) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    socket.once('close', resolve);
  });
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
