import { describe, it, expect } from 'vitest';
import { render, vnodeToHTML } from '../src/renderer.js';

// ──────────────────────────────────────────────
// render
// ──────────────────────────────────────────────
describe('render', () => {
  it('문자열 → TextNode', () => {
    const node = render('hello');
    expect(node.nodeType).toBe(3); // TEXT_NODE
    expect(node.textContent).toBe('hello');
  });

  it('빈 엘리먼트 VNode → 엘리먼트', () => {
    const el = render({ type: 'div', props: {}, children: [] });
    expect(el.tagName).toBe('DIV');
    expect(el.childNodes.length).toBe(0);
  });

  it('props → attributes', () => {
    const el = render({ type: 'a', props: { href: '/path', class: 'link' }, children: [] });
    expect(el.getAttribute('href')).toBe('/path');
    expect(el.getAttribute('class')).toBe('link');
  });

  it('key → key attribute (includeKeyAttribute: true)', () => {
    const el = render({ type: 'li', props: {}, children: [], key: 'k1' }, { includeKeyAttribute: true });
    expect(el.getAttribute('key')).toBe('k1');
  });

  it('key → key attribute 기본값에서는 포함하지 않음', () => {
    const el = render({ type: 'li', props: {}, children: [], key: 'k1' });
    expect(el.getAttribute('key')).toBeNull();
  });

  it('텍스트 자식 렌더', () => {
    const el = render({ type: 'p', props: {}, children: ['hello'] });
    expect(el.textContent).toBe('hello');
  });

  it('중첩 엘리먼트 렌더', () => {
    const vnode = {
      type: 'ul',
      props: {},
      children: [
        { type: 'li', props: {}, children: ['A'] },
        { type: 'li', props: {}, children: ['B'] },
      ],
    };
    const el = render(vnode);
    expect(el.childNodes.length).toBe(2);
    expect(el.childNodes[0].textContent).toBe('A');
    expect(el.childNodes[1].textContent).toBe('B');
  });

  it('props가 undefined여도 에러 없음', () => {
    expect(() => render({ type: 'div', props: undefined, children: [] })).not.toThrow();
  });

  it('children이 undefined여도 에러 없음', () => {
    expect(() => render({ type: 'div', props: {}, children: undefined })).not.toThrow();
  });
});

// ──────────────────────────────────────────────
// vnodeToHTML
// ──────────────────────────────────────────────
describe('vnodeToHTML', () => {
  it('텍스트 VNode → 그대로 반환', () => {
    expect(vnodeToHTML('hello')).toBe('hello');
  });

  it('HTML 특수문자 이스케이프', () => {
    expect(vnodeToHTML('<script>')).toBe('&lt;script&gt;');
    expect(vnodeToHTML('"quoted"')).toBe('&quot;quoted&quot;');
    expect(vnodeToHTML('a & b')).toBe('a &amp; b');
  });

  it('빈 엘리먼트', () => {
    expect(vnodeToHTML({ type: 'div', props: {}, children: [] })).toBe('<div></div>');
  });

  it('props → 속성으로 출력', () => {
    const out = vnodeToHTML({ type: 'a', props: { href: '/path' }, children: [] });
    expect(out).toBe('<a href="/path"></a>');
  });

  it('key → key 속성으로 출력', () => {
    const out = vnodeToHTML({ type: 'li', props: {}, children: ['x'], key: 'k1' });
    expect(out).toContain('key="k1"');
  });

  it('텍스트 전용 자식 → 인라인 출력', () => {
    const out = vnodeToHTML({ type: 'p', props: {}, children: ['hello'] });
    expect(out).toBe('<p>hello</p>');
  });

  it('텍스트 + 인라인 엘리먼트 혼합 → 줄바꿈 없음 (whitespace 방지)', () => {
    const vnode = {
      type: 'p',
      props: {},
      children: ['Hello ', { type: 'strong', props: {}, children: ['World'] }, '!'],
    };
    const out = vnodeToHTML(vnode);
    // 줄바꿈이 없어야 함
    expect(out).not.toContain('\n');
    expect(out).toBe('<p>Hello <strong>World</strong>!</p>');
  });

  it('블록 자식 → 들여쓰기 + 줄바꿈 포함', () => {
    const vnode = {
      type: 'ul',
      props: {},
      children: [
        { type: 'li', props: {}, children: ['A'] },
        { type: 'li', props: {}, children: ['B'] },
      ],
    };
    const out = vnodeToHTML(vnode);
    expect(out).toContain('\n');
    expect(out).toContain('  <li>A</li>');
    expect(out).toContain('  <li>B</li>');
  });

  it('depth 지정 시 인덴트 적용', () => {
    const out = vnodeToHTML({ type: 'div', props: {}, children: [] }, 2);
    expect(out).toBe('    <div></div>');
  });

  it('compact 모드 — 인덴트 없음', () => {
    const out = vnodeToHTML({ type: 'span', props: {}, children: ['x'] }, 2, true);
    expect(out).toBe('<span>x</span>');
  });

  it('속성값의 HTML 특수문자 이스케이프', () => {
    const out = vnodeToHTML({ type: 'div', props: { title: '<a>&"' }, children: [] });
    expect(out).toContain('&lt;a&gt;&amp;&quot;');
  });

  it('중첩 블록 들여쓰기', () => {
    const vnode = {
      type: 'div',
      props: {},
      children: [
        {
          type: 'ul',
          props: {},
          children: [{ type: 'li', props: {}, children: ['X'] }],
        },
      ],
    };
    const out = vnodeToHTML(vnode);
    expect(out).toContain('    <li>X</li>'); // depth 2 → 4 spaces
  });
});
