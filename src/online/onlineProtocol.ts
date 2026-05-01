import type { PlayerAction } from '../game/types';
import type { BattleState } from '../hooks/useBattleGame';

export type OnlineRole = 'host' | 'guest';

export type ConnectionStatus = 'offline' | 'connecting' | 'waiting' | 'connected' | 'error';

export type DataChannelMessage =
  | { type: 'guestInput'; action: PlayerAction }
  | { type: 'hostSnapshot'; state: BattleState }
  | { type: 'control'; control: 'start' | 'pause' | 'resume' | 'reset' }
  | { type: 'ping'; id: string; sentAt: number }
  | { type: 'pong'; id: string; sentAt: number };

export type SignalMessage =
  | { type: 'offer'; description: RTCSessionDescriptionInit }
  | { type: 'answer'; description: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit };

export function encodeChannelMessage(message: DataChannelMessage) {
  return JSON.stringify(message);
}

export function decodeChannelMessage(raw: string): DataChannelMessage | null {
  let message: unknown;

  try {
    message = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(message) || typeof message.type !== 'string') {
    return null;
  }

  if (message.type === 'guestInput' && isPlayerAction(message.action)) {
    return { type: 'guestInput', action: message.action };
  }

  if (message.type === 'hostSnapshot' && isRecord(message.state)) {
    return { type: 'hostSnapshot', state: message.state as unknown as BattleState };
  }

  if (message.type === 'control' && isControl(message.control)) {
    return { type: 'control', control: message.control };
  }

  if ((message.type === 'ping' || message.type === 'pong') && typeof message.id === 'string' && typeof message.sentAt === 'number') {
    return { type: message.type, id: message.id, sentAt: message.sentAt };
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPlayerAction(value: unknown): value is PlayerAction {
  return value === 'left' || value === 'right' || value === 'rotate' || value === 'softDrop' || value === 'hardDrop';
}

function isControl(value: unknown): value is 'start' | 'pause' | 'resume' | 'reset' {
  return value === 'start' || value === 'pause' || value === 'resume' || value === 'reset';
}
