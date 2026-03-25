import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { parseHTML, domToVNode } from '../src/vdom.js';

// parseHTML은 브라우저 DOMParser가 필요한데 jsdom에서는 지원하지 않으므로
// domToVNode만 직접 테스트합니다.

function makeElement(html) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  return dom.window.document.body.firstChild;
}

function makeTextNode(text) {
  const dom = new JSDOM(`<!DOCTYPE html><body></body>`);
  return dom.window.document.createTextNode(text);
}

describe('domToVNode', () => {
  // ── 기본 엘리먼트 ──
  it('단순 div → VNode', () => {
    const el = makeElement('<div></div>');
    const vnode = domToVNode(el);
    expect(vnode).toEqual({ type: 'div', props: {}, children: [], key: undefined });
  });

  it('태그명 소문자 변환', () => {
    const el = makeElement('<DIV></DIV>');
    expect(domToVNode(el).type).toBe('div');
  });

  it('속성 → props 변환', () => {
    const el = makeElement('<div id="main" class="box"></div>');
    const vnode = domToVNode(el);
    expect(vnode.props).toEqual({ id: 'main', class: 'box' });
  });

  it('key 속성 → vnode.key로 분리', () => {
    const el = makeElement('<li key="item-1">text</li>');
    const vnode = domToVNode(el);
    expect(vnode.key).toBe('item-1');
    expect(vnode.props).not.toHaveProperty('key');
  });

  // ── 텍스트 노드 ──
  it('텍스트 노드 → 문자열 반환', () => {
    const el = makeElement('<span>hello</span>');
    const textNode = el.firstChild;
    expect(domToVNode(textNode)).toBe('hello');
  });

  it('공백만 있는 텍스트 노드 → null', () => {
    const node = makeTextNode('   \n  ');
    expect(domToVNode(node)).toBeNull();
  });

  it('줄바꿈 포함 공백 → null', () => {
    const node = makeTextNode('\n\t\n');
    expect(domToVNode(node)).toBeNull();
  });

  it('내용 있는 텍스트에서 연속 공백 → 단일 공백으로 정규화', () => {
    const node = makeTextNode('hello   world');
    expect(domToVNode(node)).toBe('hello world');
  });

  it('앞뒤 공백이 있는 텍스트는 trim하지 않음', () => {
    // normalizeTextNode: replace(/\s+/g, ' ')로 정규화하지만 trim은 안 함
    const node = makeTextNode('  hello  ');
    expect(domToVNode(node)).toBe(' hello ');
  });

  it('줄바꿈 포함 텍스트 → 공백 하나로 정규화', () => {
    const node = makeTextNode('a\nb\nc');
    expect(domToVNode(node)).toBe('a b c');
  });

  // ── 자식 노드 ──
  it('중첩 구조 변환', () => {
    const el = makeElement('<ul><li>A</li><li>B</li></ul>');
    const vnode = domToVNode(el);
    expect(vnode.type).toBe('ul');
    expect(vnode.children).toHaveLength(2);
    expect(vnode.children[0]).toEqual({ type: 'li', props: {}, children: ['A'], key: undefined });
    expect(vnode.children[1]).toEqual({ type: 'li', props: {}, children: ['B'], key: undefined });
  });

  it('공백 텍스트 자식은 필터링', () => {
    const el = makeElement('<div>  <span>x</span>  </div>');
    const vnode = domToVNode(el);
    // "  "은 공백 → null → 필터됨, span만 남음
    const elementChildren = vnode.children.filter((c) => typeof c !== 'string');
    expect(elementChildren).toHaveLength(1);
    expect(elementChildren[0].type).toBe('span');
  });

  it('텍스트 + 인라인 엘리먼트 혼합 자식', () => {
    const el = makeElement('<p>Hello <strong>World</strong>!</p>');
    const vnode = domToVNode(el);
    // children: ['Hello ', { type:'strong', ... }, '!']
    expect(vnode.children.some((c) => c === 'Hello ')).toBe(true);
    expect(vnode.children.some((c) => c === '!')).toBe(true);
    expect(vnode.children.some((c) => c?.type === 'strong')).toBe(true);
  });

  // ── 엣지 케이스 ──
  it('nodeType이 1,3이 아닌 노드(주석 등) → null', () => {
    const dom = new JSDOM('<!DOCTYPE html><body></body>');
    const commentNode = dom.window.document.createComment('comment');
    expect(domToVNode(commentNode)).toBeNull();
  });

  it('속성 없는 self-closing 형태 빈 엘리먼트', () => {
    const el = makeElement('<br>');
    const vnode = domToVNode(el);
    expect(vnode.type).toBe('br');
    expect(vnode.props).toEqual({});
    expect(vnode.children).toEqual([]);
  });
});

describe('parseHTML', () => {
  it('단일 루트 요소는 그대로 반환', () => {
    expect(parseHTML('<section id="root"><p>Hello</p></section>')).toEqual({
      type: 'section',
      props: { id: 'root' },
      children: [
        { type: 'p', props: {}, children: ['Hello'], key: undefined },
      ],
      key: undefined,
    });
  });

  it('여러 루트 요소는 div로 감싼다', () => {
    expect(parseHTML('<p>A</p><p>B</p>')).toEqual({
      type: 'div',
      props: {},
      children: [
        { type: 'p', props: {}, children: ['A'], key: undefined },
        { type: 'p', props: {}, children: ['B'], key: undefined },
      ],
      key: undefined,
    });
  });

  it('텍스트만 있는 입력도 div 래퍼 안에 보존', () => {
    expect(parseHTML('hello')).toEqual({
      type: 'div',
      props: {},
      children: ['hello'],
      key: undefined,
    });
  });
});
