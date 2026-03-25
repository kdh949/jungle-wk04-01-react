import test from 'node:test';
import assert from 'node:assert/strict';

import { assignInternalKeys, reconcileInternalKeys } from '../src/keyedVdom.js';
import { diff } from '../src/diff.js';

const li = (text, key) => ({
  type: 'li',
  props: {},
  children: [text],
  key,
});

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

test('reconcileInternalKeys does not steal a sibling key when edited text duplicates another item', () => {
  let seed = 300;
  const createKey = () => `node-${++seed}`;

  const previousVNode = {
    type: 'ul',
    props: {},
    key: 'list-root',
    children: [
      li('Item 1', 'item-1'),
      li('Item 2', 'item-2'),
      li('Item 3', 'item-3'),
    ],
  };

  const editedVNode = {
    type: 'ul',
    props: {},
    children: [
      { type: 'li', props: {}, children: ['Item 2'] },
      { type: 'li', props: {}, children: ['Item 2'] },
      { type: 'li', props: {}, children: ['Item 3'] },
    ],
  };

  const reconciledVNode = reconcileInternalKeys(previousVNode, editedVNode, createKey);

  assert.deepEqual(
    reconciledVNode.children.map((child) => child.key),
    ['item-1', 'item-2', 'item-3'],
  );
  assert.deepEqual(
    diff(previousVNode, reconciledVNode),
    [{ type: 'TEXT', path: [0, 0], text: 'Item 2' }],
  );
});

test('reconcileInternalKeys preserves keys for unique-content reorder', () => {
  let seed = 400;
  const createKey = () => `node-${++seed}`;

  const previousVNode = {
    type: 'ul',
    props: {},
    key: 'list-root',
    children: [
      li('A', 'item-a'),
      li('B', 'item-b'),
      li('C', 'item-c'),
    ],
  };

  const editedVNode = {
    type: 'ul',
    props: {},
    children: [
      { type: 'li', props: {}, children: ['B'] },
      { type: 'li', props: {}, children: ['A'] },
      { type: 'li', props: {}, children: ['C'] },
    ],
  };

  const reconciledVNode = reconcileInternalKeys(previousVNode, editedVNode, createKey);

  assert.deepEqual(
    reconciledVNode.children.map((child) => child.key),
    ['item-b', 'item-a', 'item-c'],
  );
});

test('reconcileInternalKeys preserves trailing keys when a new item is inserted at the front', () => {
  let seed = 500;
  const createKey = () => `node-${++seed}`;

  const previousVNode = {
    type: 'ul',
    props: {},
    key: 'list-root',
    children: [
      li('A', 'item-a'),
      li('B', 'item-b'),
      li('C', 'item-c'),
    ],
  };

  const editedVNode = {
    type: 'ul',
    props: {},
    children: [
      { type: 'li', props: {}, children: ['Inserted'] },
      { type: 'li', props: {}, children: ['A'] },
      { type: 'li', props: {}, children: ['B'] },
      { type: 'li', props: {}, children: ['C'] },
    ],
  };

  const reconciledVNode = reconcileInternalKeys(previousVNode, editedVNode, createKey);

  assert.deepEqual(
    reconciledVNode.children.map((child) => child.key),
    ['node-501', 'item-a', 'item-b', 'item-c'],
  );
});

test('reconcileInternalKeys keeps duplicate siblings stable while moving a unique item between them', () => {
  let seed = 600;
  const createKey = () => `node-${++seed}`;

  const previousVNode = {
    type: 'ul',
    props: {},
    key: 'list-root',
    children: [
      li('A', 'item-a1'),
      li('A', 'item-a2'),
      li('B', 'item-b'),
    ],
  };

  const editedVNode = {
    type: 'ul',
    props: {},
    children: [
      { type: 'li', props: {}, children: ['A'] },
      { type: 'li', props: {}, children: ['B'] },
      { type: 'li', props: {}, children: ['A'] },
    ],
  };

  const reconciledVNode = reconcileInternalKeys(previousVNode, editedVNode, createKey);

  assert.deepEqual(
    reconciledVNode.children.map((child) => child.key),
    ['item-a1', 'item-b', 'item-a2'],
  );
});
