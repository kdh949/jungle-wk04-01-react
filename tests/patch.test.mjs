import test from 'node:test';
import assert from 'node:assert/strict';

import { applyPatches } from '../src/patch.js';

class FakeNode {
  constructor() {
    this.parentNode = null;
    this.childNodes = [];
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  appendChild(node) {
    return this.insertBefore(node, null);
  }

  insertBefore(node, referenceNode) {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }

    const referenceIndex = referenceNode == null
      ? -1
      : this.childNodes.indexOf(referenceNode);

    if (referenceIndex === -1) {
      this.childNodes.push(node);
    } else {
      this.childNodes.splice(referenceIndex, 0, node);
    }

    node.parentNode = this;
    return node;
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);

    if (index !== -1) {
      this.childNodes.splice(index, 1);
      node.parentNode = null;
    }

    return node;
  }

  replaceChild(newNode, oldNode) {
    const index = this.childNodes.indexOf(oldNode);

    if (index === -1) {
      return oldNode;
    }

    if (newNode.parentNode) {
      newNode.parentNode.removeChild(newNode);
    }

    this.childNodes[index] = newNode;
    newNode.parentNode = this;
    oldNode.parentNode = null;
    return oldNode;
  }
}

class FakeElement extends FakeNode {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.attributes = {};
  }

  setAttribute(key, value) {
    this.attributes[key] = String(value);
  }

  removeAttribute(key) {
    delete this.attributes[key];
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this.childNodes = [new FakeText(value)];
    this.childNodes[0].parentNode = this;
  }
}

class FakeText extends FakeNode {
  constructor(text) {
    super();
    this._text = text;
  }

  get textContent() {
    return this._text;
  }

  set textContent(value) {
    this._text = value;
  }
}

class FakeDocumentFragment extends FakeNode {}

const buildList = (...labels) => {
  const listEl = new FakeElement('ul');

  labels.forEach((label) => {
    const itemEl = new FakeElement('li');
    itemEl.appendChild(new FakeText(label));
    listEl.appendChild(itemEl);
  });

  return listEl;
};

test('applyPatches reorders keyed siblings when MOVE patch is applied', () => {
  globalThis.Element = FakeElement;
  globalThis.Text = FakeText;
  globalThis.DocumentFragment = FakeDocumentFragment;

  const rootEl = new FakeElement('div');
  rootEl.appendChild(buildList('A', 'B', 'C'));

  applyPatches(rootEl, [
    { type: 'MOVE', from: [1], path: [0] },
  ]);

  const labels = rootEl.firstChild.childNodes.map((node) => node.textContent);
  assert.deepEqual(labels, ['B', 'A', 'C']);
});
