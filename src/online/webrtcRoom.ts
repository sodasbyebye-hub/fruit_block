import { decodeChannelMessage, encodeChannelMessage, type DataChannelMessage, type OnlineRole, type SignalMessage } from './onlineProtocol';
import type { SignalingClient } from './signalingClient';

interface WebRtcRoomOptions {
  role: OnlineRole;
  code: string;
  clientId: string;
  cursor: number;
  signaling: SignalingClient;
  onConnected: () => void;
  onMessage: (message: DataChannelMessage) => void;
  onPeerJoined: () => void;
  onPeerLeft: () => void;
  onError: (message: string) => void;
}

export interface WebRtcRoomConnection {
  send: (message: DataChannelMessage) => boolean;
  close: () => void;
  isOpen: () => boolean;
}

const POLL_MS = 350;

export function createWebRtcRoom(options: WebRtcRoomOptions): WebRtcRoomConnection {
  const abort = new AbortController();
  const pendingCandidates: RTCIceCandidateInit[] = [];
  let channel: RTCDataChannel | null = null;
  let cursor = options.cursor;
  let closed = false;

  const peer = new RTCPeerConnection({
    iceServers: getIceServers(),
  });

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      void options.signaling.sendSignal(options.code, options.clientId, { type: 'candidate', candidate: event.candidate.toJSON() }, abort.signal).catch(
        reportError,
      );
    }
  };

  peer.onconnectionstatechange = () => {
    if (peer.connectionState === 'failed') {
      options.onError('WebRTC connection failed');
    }

    if (!closed && (peer.connectionState === 'disconnected' || peer.connectionState === 'closed')) {
      options.onPeerLeft();
    }
  };

  peer.ondatachannel = (event) => {
    setupChannel(event.channel);
  };

  if (options.role === 'host') {
    setupChannel(peer.createDataChannel('jelly-battle', { ordered: true }));
    void createOffer().catch(reportError);
  }

  void pollSignals().catch(reportError);

  return {
    send(message) {
      if (channel?.readyState !== 'open') {
        return false;
      }

      channel.send(encodeChannelMessage(message));
      return true;
    },
    close() {
      if (closed) {
        return;
      }

      closed = true;
      abort.abort();
      channel?.close();
      peer.close();
      void options.signaling.leaveRoom(options.code, options.clientId).catch(() => undefined);
    },
    isOpen() {
      return channel?.readyState === 'open';
    },
  };

  function setupChannel(nextChannel: RTCDataChannel) {
    channel = nextChannel;
    channel.onopen = options.onConnected;
    channel.onclose = () => {
      if (!closed) {
        options.onPeerLeft();
      }
    };
    channel.onerror = () => options.onError('Data channel error');
    channel.onmessage = (event) => {
      const message = decodeChannelMessage(String(event.data));
      if (message) {
        options.onMessage(message);
      }
    };
  }

  async function createOffer() {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await options.signaling.sendSignal(options.code, options.clientId, { type: 'offer', description: offer }, abort.signal);
  }

  async function pollSignals() {
    while (!closed) {
      const result = await options.signaling.poll(options.code, options.clientId, cursor, abort.signal);
      cursor = result.cursor ?? cursor;

      for (const message of result.messages) {
        if (message.type === 'peerJoined') {
          options.onPeerJoined();
        } else if (message.type === 'peerLeft') {
          options.onPeerLeft();
        } else if (message.type === 'signal' && message.signal) {
          await handleSignal(message.signal);
        }
      }

      await delay(POLL_MS, abort.signal);
    }
  }

  async function handleSignal(signal: SignalMessage) {
    if (signal.type === 'offer' && options.role === 'guest') {
      await peer.setRemoteDescription(signal.description);
      await flushCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await options.signaling.sendSignal(options.code, options.clientId, { type: 'answer', description: answer }, abort.signal);
      return;
    }

    if (signal.type === 'answer' && options.role === 'host') {
      await peer.setRemoteDescription(signal.description);
      await flushCandidates();
      return;
    }

    if (signal.type === 'candidate') {
      if (!peer.remoteDescription) {
        pendingCandidates.push(signal.candidate);
        return;
      }

      await peer.addIceCandidate(signal.candidate);
    }
  }

  async function flushCandidates() {
    while (pendingCandidates.length > 0) {
      const candidate = pendingCandidates.shift();
      if (candidate) {
        await peer.addIceCandidate(candidate);
      }
    }
  }

  function reportError(error: unknown) {
    if (!closed && !abort.signal.aborted) {
      options.onError(error instanceof Error ? error.message : 'WebRTC room error');
    }
  }
}

function getIceServers(): RTCIceServer[] {
  const configured = import.meta.env.VITE_ICE_SERVERS;
  if (configured) {
    try {
      const parsed = JSON.parse(configured) as RTCIceServer[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return defaultIceServers();
    }
  }

  return defaultIceServers();
}

function defaultIceServers(): RTCIceServer[] {
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}
