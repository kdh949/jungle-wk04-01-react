import test from 'node:test';
import assert from 'node:assert/strict';

import { createHistory } from '../src/history.js';

test('history returns null values when empty', () => {
  const history = createHistory();

  assert.equal(history.current(), null);
  assert.equal(history.back(), null);
  assert.equal(history.forward(), null);
  assert.equal(history.canBack(), false);
  assert.equal(history.canForward(), false);
});

test('history push stores current state and enables back navigation', () => {
  const history = createHistory();
  const vnodeA = { type: 'div', props: {}, children: ['A'] };
  const vnodeB = { type: 'div', props: {}, children: ['B'] };

  history.push(vnodeA);
  history.push(vnodeB);

  assert.equal(history.current(), vnodeB);
  assert.equal(history.canBack(), true);
  assert.equal(history.canForward(), false);
});

test('history back moves current state to forward stack', () => {
  const history = createHistory();
  const vnodeA = { type: 'div', props: {}, children: ['A'] };
  const vnodeB = { type: 'div', props: {}, children: ['B'] };

  history.push(vnodeA);
  history.push(vnodeB);

  assert.equal(history.back(), vnodeA);
  assert.equal(history.current(), vnodeA);
  assert.equal(history.canBack(), false);
  assert.equal(history.canForward(), true);
});

test('history forward restores the next state', () => {
  const history = createHistory();
  const vnodeA = { type: 'div', props: {}, children: ['A'] };
  const vnodeB = { type: 'div', props: {}, children: ['B'] };

  history.push(vnodeA);
  history.push(vnodeB);
  history.back();

  assert.equal(history.forward(), vnodeB);
  assert.equal(history.current(), vnodeB);
  assert.equal(history.canBack(), true);
  assert.equal(history.canForward(), false);
});

test('history clears forward stack when a new state is pushed', () => {
  const history = createHistory();
  const vnodeA = { type: 'div', props: {}, children: ['A'] };
  const vnodeB = { type: 'div', props: {}, children: ['B'] };
  const vnodeC = { type: 'div', props: {}, children: ['C'] };

  history.push(vnodeA);
  history.push(vnodeB);
  history.back();
  history.push(vnodeC);

  assert.equal(history.current(), vnodeC);
  assert.equal(history.canForward(), false);
  assert.equal(history.forward(), null);
});
