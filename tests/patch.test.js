import { describe, it, expect, beforeEach } from 'vitest';
import { getNodeByPath, applyPatches } from '../src/patch.js';
import { render } from '../src/renderer.js';

// rootEl 헬퍼: <div><ul><li>A</li><li>B</li></ul></div>
function makeRoot() {
  const vnode = {
    type: 'div',
    props: {},
    children: [
      {
        type: 'ul',
        props: {},
        children: [
          { type: 'li', props: {}, children: ['A'] },
          { type: 'li', props: {}, children: ['B'] },
        ],
      },
    ],
  };
  const root = document.createElement('div');
  root.appendChild(render(vnode));
  return root;
}

// ──────────────────────────────────────────────
// getNodeByPath
// ──────────────────────────────────────────────
describe('getNodeByPath', () => {
  let root;
  beforeEach(() => {
    root = makeRoot();
  });

  it('path=[] → rootEl.firstChild (div)', () => {
    const node = getNodeByPath(root, []);
    expect(node.tagName).toBe('DIV');
  });

  it('path=[0] → ul', () => {
    const node = getNodeByPath(root, [0]);
    expect(node.tagName).toBe('UL');
  });

  it('path=[0,0] → 첫번째 li', () => {
    const node = getNodeByPath(root, [0, 0]);
    expect(node.tagName).toBe('LI');
    expect(node.textContent).toBe('A');
  });

  it('path=[0,1] → 두번째 li', () => {
    const node = getNodeByPath(root, [0, 1]);
    expect(node.textContent).toBe('B');
  });

  it('path=[0,0,0] → 텍스트 노드', () => {
    const node = getNodeByPath(root, [0, 0, 0]);
    expect(node.nodeType).toBe(3);
    expect(node.textContent).toBe('A');
  });

  it('존재하지 않는 인덱스 → null', () => {
    expect(getNodeByPath(root, [0, 99])).toBeNull();
  });

  it('빈 rootEl → null 반환 (첫번째 자식 없음)', () => {
    const emptyRoot = document.createElement('div');
    expect(getNodeByPath(emptyRoot, [])).toBeNull();
  });
});

// ──────────────────────────────────────────────
// applyPatches
// ──────────────────────────────────────────────
describe('applyPatches — CREATE', () => {
  it('새 li 추가', () => {
    const root = makeRoot();
    const ul = root.querySelector('ul');
    applyPatches(root, [
      {
        type: 'CREATE',
        path: [0, 2],
        newNode: { type: 'li', props: {}, children: ['C'] },
      },
    ]);
    expect(ul.children.length).toBe(3);
    expect(ul.children[2].textContent).toBe('C');
  });

  it('존재하는 위치에 삽입 (insertBefore)', () => {
    const root = makeRoot();
    applyPatches(root, [
      {
        type: 'CREATE',
        path: [0, 0],
        newNode: { type: 'li', props: {}, children: ['Z'] },
      },
    ]);
    expect(root.querySelector('ul').children[0].textContent).toBe('Z');
  });
});

describe('applyPatches — DELETE', () => {
  it('첫번째 li 삭제', () => {
    const root = makeRoot();
    applyPatches(root, [{ type: 'DELETE', path: [0, 0] }]);
    const ul = root.querySelector('ul');
    expect(ul.children.length).toBe(1);
    expect(ul.children[0].textContent).toBe('B');
  });

  it('역순 DELETE → 올바른 결과 (3→0)', () => {
    const vnode = {
      type: 'ul',
      props: {},
      children: [
        { type: 'li', props: {}, children: ['A'] },
        { type: 'li', props: {}, children: ['B'] },
        { type: 'li', props: {}, children: ['C'] },
      ],
    };
    const root = document.createElement('div');
    root.appendChild(render(vnode));
    applyPatches(root, [
      { type: 'DELETE', path: [2] },
      { type: 'DELETE', path: [1] },
      { type: 'DELETE', path: [0] },
    ]);
    expect(root.firstChild.children.length).toBe(0);
  });
});

describe('applyPatches — REPLACE', () => {
  it('li → span으로 교체', () => {
    const root = makeRoot();
    applyPatches(root, [
      {
        type: 'REPLACE',
        path: [0, 0],
        newNode: { type: 'span', props: {}, children: ['replaced'] },
      },
    ]);
    expect(root.querySelector('ul').children[0].tagName).toBe('SPAN');
    expect(root.querySelector('ul').children[0].textContent).toBe('replaced');
  });
});

describe('applyPatches — UPDATE_PROPS', () => {
  it('속성 추가', () => {
    const root = makeRoot();
    applyPatches(root, [
      { type: 'UPDATE_PROPS', path: [0, 0], propsDiff: { class: 'active' } },
    ]);
    expect(root.querySelectorAll('li')[0].getAttribute('class')).toBe('active');
  });

  it('속성 삭제 (null 값)', () => {
    const vnode = {
      type: 'ul',
      props: {},
      children: [{ type: 'li', props: { class: 'active' }, children: ['A'] }],
    };
    const root = document.createElement('div');
    root.appendChild(render(vnode));
    applyPatches(root, [
      { type: 'UPDATE_PROPS', path: [0], propsDiff: { class: null } },
    ]);
    expect(root.querySelector('li').hasAttribute('class')).toBe(false);
  });

  it('속성 변경', () => {
    const root = makeRoot();
    applyPatches(root, [
      { type: 'UPDATE_PROPS', path: [0], propsDiff: { id: 'new-id' } },
    ]);
    expect(root.querySelector('ul').getAttribute('id')).toBe('new-id');
  });
});

describe('applyPatches — TEXT', () => {
  it('텍스트 노드 내용 변경', () => {
    const root = makeRoot();
    applyPatches(root, [
      { type: 'TEXT', path: [0, 0, 0], text: 'Updated' },
    ]);
    expect(root.querySelectorAll('li')[0].textContent).toBe('Updated');
  });
});

describe('applyPatches — 복합 패치', () => {
  it('DELETE 후 CREATE 적용', () => {
    const root = makeRoot();
    applyPatches(root, [
      { type: 'DELETE', path: [0, 1] },
      {
        type: 'CREATE',
        path: [0, 1],
        newNode: { type: 'li', props: {}, children: ['NEW'] },
      },
    ]);
    const items = root.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(items[1].textContent).toBe('NEW');
  });
});
