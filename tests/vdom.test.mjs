import test from 'node:test';
import assert from 'node:assert/strict';

import { domToVNode } from '../src/vdom.js';

test('domToVNode normalizes mixed-content text whitespace', () => {
  const textBefore = {
    nodeType: 3,
    textContent: '\n                Edit the textarea on the right and click\n                ',
  };

  const strongNode = {
    nodeType: 1,
    tagName: 'STRONG',
    attributes: [],
    childNodes: [
      {
        nodeType: 3,
        textContent: 'Patch',
      },
    ],
  };

  const textAfter = {
    nodeType: 3,
    textContent: '.\n              ',
  };

  const paragraphNode = {
    nodeType: 1,
    tagName: 'P',
    attributes: [],
    childNodes: [textBefore, strongNode, textAfter],
  };

  assert.deepEqual(domToVNode(paragraphNode), {
    type: 'p',
    props: {},
    children: [
      ' Edit the textarea on the right and click ',
      {
        type: 'strong',
        props: {},
        children: ['Patch'],
        key: undefined,
      },
      '. ',
    ],
    key: undefined,
  });
});
