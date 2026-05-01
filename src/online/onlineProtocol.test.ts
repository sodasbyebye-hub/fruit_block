import { describe, expect, it } from 'vitest';
import { decodeChannelMessage, encodeChannelMessage } from './onlineProtocol';

describe('onlineProtocol', () => {
  it('encodes and decodes player input messages', () => {
    const encoded = encodeChannelMessage({ type: 'guestInput', action: 'left' });

    expect(decodeChannelMessage(encoded)).toEqual({ type: 'guestInput', action: 'left' });
  });

  it('drops malformed and unknown messages', () => {
    expect(decodeChannelMessage('not json')).toBeNull();
    expect(decodeChannelMessage(JSON.stringify({ type: 'guestInput', action: 'jump' }))).toBeNull();
    expect(decodeChannelMessage(JSON.stringify({ type: 'unknown' }))).toBeNull();
  });

  it('accepts ping and pong latency messages', () => {
    expect(decodeChannelMessage(JSON.stringify({ type: 'ping', id: 'a', sentAt: 12 }))).toEqual({
      type: 'ping',
      id: 'a',
      sentAt: 12,
    });
    expect(decodeChannelMessage(JSON.stringify({ type: 'pong', id: 'a', sentAt: 12 }))).toEqual({
      type: 'pong',
      id: 'a',
      sentAt: 12,
    });
  });
});
