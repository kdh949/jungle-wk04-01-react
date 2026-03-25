/**
 * 통합 테스트: diff → applyPatches → DOM 결과 검증
 * 실제 사용 흐름(VNode 생성 → 렌더 → diff → 패치)을 end-to-end로 확인합니다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { diff } from '../src/diff.js';
import { render } from '../src/renderer.js';
import { applyPatches } from '../src/patch.js';
import { createHistory } from '../src/history.js';
import { vnodeToHTML } from '../src/renderer.js';

// helpers
const li = (text, props = {}) => ({ type: 'li', props, children: [text] });
const kli = (key, text) => ({ type: 'li', props: {}, children: [text], key });
const ul = (children) => ({ type: 'ul', props: {}, children });

function applyDiff(oldVNode, newVNode) {
  const root = document.createElement('div');
  root.appendChild(render(oldVNode));
  const patches = diff(oldVNode, newVNode);
  applyPatches(root, patches);
  return root;
}

// ──────────────────────────────────────────────
// 기본 diff + patch
// ──────────────────────────────────────────────
describe('통합: 기본 diff + patch', () => {
  it('텍스트 변경', () => {
    const root = applyDiff(
      { type: 'p', props: {}, children: ['before'] },
      { type: 'p', props: {}, children: ['after'] },
    );
    expect(root.querySelector('p').textContent).toBe('after');
  });

  it('속성 추가', () => {
    const root = applyDiff(
      { type: 'div', props: {}, children: [] },
      { type: 'div', props: { id: 'box' }, children: [] },
    );
    expect(root.querySelector('div').getAttribute('id')).toBe('box');
  });

  it('속성 삭제', () => {
    const root = applyDiff(
      { type: 'div', props: { id: 'old' }, children: [] },
      { type: 'div', props: {}, children: [] },
    );
    expect(root.querySelector('div').hasAttribute('id')).toBe(false);
  });

  it('엘리먼트 타입 교체', () => {
    const root = applyDiff(
      { type: 'span', props: {}, children: ['x'] },
      { type: 'strong', props: {}, children: ['x'] },
    );
    expect(root.querySelector('strong')).not.toBeNull();
    expect(root.querySelector('span')).toBeNull();
  });
});

// ──────────────────────────────────────────────
// unkeyed 자식 목록 조작
// ──────────────────────────────────────────────
describe('통합: unkeyed 자식 추가/삭제', () => {
  it('자식 추가 (1 → 3)', () => {
    const root = applyDiff(
      ul([li('A')]),
      ul([li('A'), li('B'), li('C')]),
    );
    expect(root.querySelectorAll('li').length).toBe(3);
    expect(root.querySelectorAll('li')[2].textContent).toBe('C');
  });

  it('자식 삭제 (3 → 1)', () => {
    const root = applyDiff(
      ul([li('A'), li('B'), li('C')]),
      ul([li('A')]),
    );
    expect(root.querySelectorAll('li').length).toBe(1);
    expect(root.querySelectorAll('li')[0].textContent).toBe('A');
  });

  it('자식 전체 삭제 (3 → 0)', () => {
    const root = applyDiff(
      ul([li('A'), li('B'), li('C')]),
      ul([]),
    );
    expect(root.querySelectorAll('li').length).toBe(0);
  });

  it('자식 전체 추가 (0 → 3)', () => {
    const root = applyDiff(
      ul([]),
      ul([li('A'), li('B'), li('C')]),
    );
    expect(root.querySelectorAll('li').length).toBe(3);
  });

  it('자식 일부 텍스트 변경', () => {
    const root = applyDiff(
      ul([li('A'), li('B')]),
      ul([li('A'), li('Z')]),
    );
    const items = root.querySelectorAll('li');
    expect(items[0].textContent).toBe('A');
    expect(items[1].textContent).toBe('Z');
  });
});

// ──────────────────────────────────────────────
// keyed 자식 목록 조작
// ──────────────────────────────────────────────
describe('통합: keyed 자식', () => {
  it('중간 항목 삭제 (key 기반)', () => {
    const root = applyDiff(
      ul([kli('a','A'), kli('b','B'), kli('c','C')]),
      ul([kli('a','A'), kli('c','C')]),
    );
    const items = root.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('A');
    expect(items[1].textContent).toBe('C');
  });

  it('새 key 항목 추가', () => {
    const root = applyDiff(
      ul([kli('a','A'), kli('c','C')]),
      ul([kli('a','A'), kli('b','B'), kli('c','C')]),
    );
    expect(root.querySelectorAll('li').length).toBe(3);
  });

  it('기존 key 내용 변경', () => {
    const root = applyDiff(
      ul([kli('a','A'), kli('b','B')]),
      ul([kli('a','A'), kli('b','Z')]),
    );
    expect(root.querySelectorAll('li')[1].textContent).toBe('Z');
  });

  it('전체 key 교체', () => {
    const root = applyDiff(
      ul([kli('a','A'), kli('b','B')]),
      ul([kli('x','X'), kli('y','Y')]),
    );
    const items = root.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('X');
    expect(items[1].textContent).toBe('Y');
  });

  it('전체 삭제 후 새 항목 추가', () => {
    const root = applyDiff(
      ul([kli('a','A'), kli('b','B'), kli('c','C')]),
      ul([kli('d','D')]),
    );
    const items = root.querySelectorAll('li');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toBe('D');
  });

  it('순서만 바뀐 keyed 자식도 실제 DOM 순서를 갱신', () => {
    const root = applyDiff(
      ul([kli('a', 'A'), kli('b', 'B')]),
      ul([kli('b', 'B'), kli('a', 'A')]),
    );
    const items = root.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('B');
    expect(items[1].textContent).toBe('A');
  });
});

// ──────────────────────────────────────────────
// history 통합
// ──────────────────────────────────────────────
describe('통합: history + diff + patch', () => {
  it('push → back → forward 후 DOM 상태 일치', () => {
    const history = createHistory();

    const v1 = { type: 'p', props: {}, children: ['state1'] };
    const v2 = { type: 'p', props: {}, children: ['state2'] };
    const v3 = { type: 'p', props: {}, children: ['state3'] };

    history.push(v1);
    history.push(v2);
    history.push(v3);

    // state3 렌더
    const root = document.createElement('div');
    root.appendChild(render(v3));
    expect(root.querySelector('p').textContent).toBe('state3');

    // back → v2
    const prev = history.back();
    const patches1 = diff(v3, prev);
    applyPatches(root, patches1);
    expect(root.querySelector('p').textContent).toBe('state2');

    // back → v1
    const prev2 = history.back();
    const patches2 = diff(prev, prev2);
    applyPatches(root, patches2);
    expect(root.querySelector('p').textContent).toBe('state1');

    // forward → v2
    const next = history.forward();
    const patches3 = diff(prev2, next);
    applyPatches(root, patches3);
    expect(root.querySelector('p').textContent).toBe('state2');
  });

  it('새 push 후 canForward === false', () => {
    const history = createHistory();
    history.push({ id: 1 });
    history.push({ id: 2 });
    history.back();
    history.push({ id: 3 });
    expect(history.canForward()).toBe(false);
  });
});

// ──────────────────────────────────────────────
// vnodeToHTML 라운드트립
// ──────────────────────────────────────────────
describe('통합: vnodeToHTML 라운드트립 (공백 안전성)', () => {
  it('블록 엘리먼트 직렬화 시 줄바꿈 포함', () => {
    const vnode = ul([li('A'), li('B')]);
    const html = vnodeToHTML(vnode);
    expect(html).toContain('\n');
  });

  it('인라인 혼합 직렬화 시 줄바꿈 없음 (공백 텍스트 방지)', () => {
    const vnode = {
      type: 'p',
      props: {},
      children: ['Hello ', { type: 'em', props: {}, children: ['world'] }],
    };
    const html = vnodeToHTML(vnode);
    expect(html).not.toContain('\n');
  });
});

// ──────────────────────────────────────────────
// 엣지: 변화 없을 때 DOM 불변
// ──────────────────────────────────────────────
describe('통합: 변화 없을 때 패치 없음', () => {
  it('동일 VNode → 패치 0개', () => {
    const vnode = ul([li('A'), li('B')]);
    const patches = diff(vnode, vnode);
    expect(patches).toHaveLength(0);
  });

  it('동일 keyed VNode → 패치 0개', () => {
    const vnode = ul([kli('a','A'), kli('b','B')]);
    const patches = diff(vnode, vnode);
    expect(patches).toHaveLength(0);
  });
});
