import test from 'node:test';
import assert from 'node:assert/strict';

import { assignInternalKeys, reconcileInternalKeys } from '../src/keyedVdom.js';

test('assignInternalKeys preserves existing keys and fills missing keys', () => {
  let seed = 0;
  const createKey = () => `node-${++seed}`;

  const vnode = {
    type: 'div',
    props: {},
    children: [
      { type: 'li', props: {}, children: ['A'], key: 'item-a' },
      { type: 'li', props: {}, children: ['B'] },
    ],
  };

  const keyedVNode = assignInternalKeys(vnode, createKey);

  assert.equal(keyedVNode.key, 'node-1');
  assert.equal(keyedVNode.children[0].key, 'item-a');
  assert.equal(keyedVNode.children[1].key, 'node-2');
});

test('reconcileInternalKeys keeps existing keys when identical siblings shift index', () => {
  let seed = 100;
  const createKey = () => `node-${++seed}`;

  const previousVNode = {
    type: 'ul',
    props: {},
    key: 'list-root',
    children: [
      { type: 'li', props: {}, children: ['Item 1'], key: 'item-1' },
      { type: 'li', props: {}, children: ['Item 2'], key: 'item-2' },
      { type: 'li', props: {}, children: ['Item 3'], key: 'item-3' },
    ],
  };

  const editedVNode = {
    type: 'ul',
    props: {},
    children: [
      { type: 'li', props: {}, children: ['Inserted'] },
      { type: 'li', props: {}, children: ['Item 1'] },
      { type: 'li', props: {}, children: ['Item 2'] },
      { type: 'li', props: {}, children: ['Item 3'] },
    ],
  };

  const reconciledVNode = reconcileInternalKeys(previousVNode, editedVNode, createKey);

  assert.deepEqual(
    reconciledVNode.children.map((child) => child.key),
    ['node-101', 'item-1', 'item-2', 'item-3'],
  );
});

test('reconcileInternalKeys keeps the same key for same-index text edits', () => {
  let seed = 200;
  const createKey = () => `node-${++seed}`;

  const previousVNode = {
    type: 'ul',
    props: {},
    key: 'list-root',
    children: [
      { type: 'li', props: {}, children: ['Item 1'], key: 'item-1' },
      { type: 'li', props: {}, children: ['Item 2'], key: 'item-2' },
    ],
  };

  const editedVNode = {
    type: 'ul',
    props: {},
    children: [
      { type: 'li', props: {}, children: ['Item 1 updated'] },
      { type: 'li', props: {}, children: ['Item 2'] },
    ],
  };

  const reconciledVNode = reconcileInternalKeys(previousVNode, editedVNode, createKey);

  assert.equal(reconciledVNode.children[0].key, 'item-1');
  assert.equal(reconciledVNode.children[1].key, 'item-2');
});
