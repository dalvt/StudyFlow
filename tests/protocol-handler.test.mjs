import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProtocolAction } from '../src/protocol-utils.ts';

test('parseProtocolAction: parses action=start', () => {
  const res = parseProtocolAction({ action: 'start' });
  assert.strictEqual(res.action, 'start');
});

test('parseProtocolAction: parses action=pause', () => {
  const res = parseProtocolAction({ action: 'pause' });
  assert.strictEqual(res.action, 'pause');
});

test('parseProtocolAction: parses action=capture with URL encoded text', () => {
  const res = parseProtocolAction({ action: 'capture', text: 'Estudiar%20Historia%20cap%204' });
  assert.strictEqual(res.action, 'capture');
  assert.strictEqual(res.text, 'Estudiar Historia cap 4');
});

test('parseProtocolAction: parses text-only query as capture', () => {
  const res = parseProtocolAction({ text: 'Repasar formulas' });
  assert.strictEqual(res.action, 'capture');
  assert.strictEqual(res.text, 'Repasar formulas');
});

test('parseProtocolAction: handles aliases cmd=play and do=pause', () => {
  assert.strictEqual(parseProtocolAction({ cmd: 'play' }).action, 'start');
  assert.strictEqual(parseProtocolAction({ do: 'stop' }).action, 'pause');
});

test('parseProtocolAction: handles unknown actions safely', () => {
  const res = parseProtocolAction({ action: 'nonexistent' });
  assert.strictEqual(res.action, 'unknown');
});
