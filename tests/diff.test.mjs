import test from 'node:test';
import assert from 'node:assert/strict';

import { diff, diffProps } from '../src/diff.js';

test('diffProps returns changed and removed props', () => {
  assert.deepEqual(
    diffProps(
      { class: 'before', id: 'sample', title: 'hello' },
      { class: 'after', title: 'hello', role: 'presentation' },
    ),
    {
      class: 'after',
      id: null,
      role: 'presentation',
    },
  );
});

test('diff returns no patches when both nodes are null', () => {
  assert.deepEqual(diff(null, null), []);
});

test('diff returns DELETE when new node is missing', () => {
  assert.deepEqual(
    diff({ type: 'div', props: {}, children: [] }, null, [1]),
    [{ type: 'DELETE', path: [1] }],
  );
});

test('diff returns CREATE when old node is missing', () => {
  const newNode = { type: 'span', props: { class: 'new' }, children: ['A'] };

  assert.deepEqual(
    diff(null, newNode, [2]),
    [{ type: 'CREATE', path: [2], newNode }],
  );
});

test('diff returns TEXT when text content changes', () => {
  assert.deepEqual(
    diff('before', 'after', [0, 1]),
    [{ type: 'TEXT', path: [0, 1], text: 'after' }],
  );
});

test('diff returns REPLACE when node types differ', () => {
  const newNode = { type: 'section', props: {}, children: [] };

  assert.deepEqual(
    diff(
      { type: 'div', props: {}, children: [] },
      newNode,
      [0],
    ),
    [{ type: 'REPLACE', path: [0], newNode }],
  );
});

test('diff returns REPLACE when text and vnode types differ', () => {
  const newNode = { type: 'strong', props: {}, children: ['bold'] };

  assert.deepEqual(
    diff('plain', newNode, [1, 0]),
    [{ type: 'REPLACE', path: [1, 0], newNode }],
  );
});

test('diff accumulates prop and child patches recursively', () => {
  const oldNode = {
    type: 'div',
    props: { class: 'box', id: 'root' },
    children: [
      'Hello',
      {
        type: 'span',
        props: {},
        children: ['A'],
      },
    ],
  };

  const newNode = {
    type: 'div',
    props: { class: 'card' },
    children: [
      'World',
      {
        type: 'span',
        props: {},
        children: ['A'],
      },
      {
        type: 'strong',
        props: {},
        children: ['!'],
      },
    ],
  };

  assert.deepEqual(diff(oldNode, newNode), [
    {
      type: 'UPDATE_PROPS',
      path: [],
      propsDiff: {
        class: 'card',
        id: null,
      },
    },
    {
      type: 'TEXT',
      path: [0],
      text: 'World',
    },
    {
      type: 'CREATE',
      path: [2],
      newNode: {
        type: 'strong',
        props: {},
        children: ['!'],
      },
    },
  ]);
});

test('diff returns child DELETE patches in reverse order for unkeyed removals', () => {
  const oldNode = {
    type: 'div',
    props: {},
    children: [
      { type: 'h1', props: {}, children: ['Title'] },
      { type: 'ul', props: {}, children: ['Items'] },
      { type: 'p', props: {}, children: ['Description'] },
    ],
  };

  const newNode = {
    type: 'div',
    props: {},
    children: [],
  };

  assert.deepEqual(diff(oldNode, newNode), [
    { type: 'DELETE', path: [2] },
    { type: 'DELETE', path: [1] },
    { type: 'DELETE', path: [0] },
  ]);
});
