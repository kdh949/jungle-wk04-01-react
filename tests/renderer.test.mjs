import test from 'node:test';
import assert from 'node:assert/strict';

import { vnodeToHTML } from '../src/renderer.js';

test('vnodeToHTML keeps mixed text and inline elements on one line', () => {
  const vnode = {
    type: 'p',
    props: {},
    children: [
      'Edit the textarea on the right and click ',
      {
        type: 'strong',
        props: {},
        children: ['Patch'],
      },
      '.',
    ],
  };

  assert.equal(
    vnodeToHTML(vnode),
    '<p>Edit the textarea on the right and click <strong>Patch</strong>.</p>',
  );
});

test('vnodeToHTML keeps indentation when text is mixed with block elements', () => {
  const vnode = {
    type: 'div',
    props: {},
    children: [
      'before',
      {
        type: 'p',
        props: {},
        children: ['content'],
      },
      'after',
    ],
  };

  assert.equal(
    vnodeToHTML(vnode),
    '<div>\n  before\n  <p>content</p>\n  after\n</div>',
  );
});
