import { describe, it, expect } from 'vitest';
import { diff, diffProps } from '../src/diff.js';

// ──────────────────────────────────────────────
// diffProps
// ──────────────────────────────────────────────
describe('diffProps', () => {
  it('빈 객체끼리 비교 → 빈 diff', () => {
    expect(diffProps({}, {})).toEqual({});
  });

  it('모두 같은 props → 빈 diff', () => {
    expect(diffProps({ id: 'a', class: 'x' }, { id: 'a', class: 'x' })).toEqual({});
  });

  it('새 prop 추가', () => {
    expect(diffProps({}, { id: 'new' })).toEqual({ id: 'new' });
  });

  it('prop 값 변경', () => {
    expect(diffProps({ id: 'old' }, { id: 'new' })).toEqual({ id: 'new' });
  });

  it('prop 삭제 → null 값으로 표시', () => {
    expect(diffProps({ id: 'x', class: 'y' }, {})).toEqual({ id: null, class: null });
  });

  it('추가 + 변경 + 삭제 혼합', () => {
    const result = diffProps(
      { id: 'old', class: 'x', 'data-remove': '1' },
      { id: 'new', href: 'url' },
    );
    expect(result).toEqual({ id: 'new', href: 'url', class: null, 'data-remove': null });
  });

  it('oldProps 기본값 (undefined 전달)', () => {
    expect(diffProps(undefined, { id: 'x' })).toEqual({ id: 'x' });
  });

  it('newProps 기본값 (undefined 전달)', () => {
    expect(diffProps({ id: 'x' }, undefined)).toEqual({ id: null });
  });
});

// ──────────────────────────────────────────────
// diff — null 케이스
// ──────────────────────────────────────────────
describe('diff — null 처리', () => {
  it('둘 다 null → 패치 없음', () => {
    expect(diff(null, null)).toEqual([]);
  });

  it('oldNode만 null → CREATE', () => {
    const newNode = { type: 'div', props: {}, children: [] };
    expect(diff(null, newNode)).toEqual([{ type: 'CREATE', path: [], newNode }]);
  });

  it('newNode만 null → DELETE', () => {
    const oldNode = { type: 'div', props: {}, children: [] };
    expect(diff(oldNode, null)).toEqual([{ type: 'DELETE', path: [] }]);
  });
});

// ──────────────────────────────────────────────
// diff — 텍스트 노드
// ──────────────────────────────────────────────
describe('diff — 텍스트 노드', () => {
  it('같은 텍스트 → 패치 없음', () => {
    expect(diff('hello', 'hello')).toEqual([]);
  });

  it('다른 텍스트 → TEXT 패치', () => {
    expect(diff('hello', 'world')).toEqual([{ type: 'TEXT', path: [], text: 'world' }]);
  });

  it('빈 문자열 → 빈 문자열 (동일)', () => {
    expect(diff('', '')).toEqual([]);
  });

  it('텍스트 → 엘리먼트 교체 → REPLACE', () => {
    const newNode = { type: 'span', props: {}, children: [] };
    expect(diff('text', newNode)).toEqual([{ type: 'REPLACE', path: [], newNode }]);
  });

  it('엘리먼트 → 텍스트 교체 → REPLACE', () => {
    const oldNode = { type: 'span', props: {}, children: [] };
    expect(diff(oldNode, 'text')).toEqual([{ type: 'REPLACE', path: [], newNode: 'text' }]);
  });
});

// ──────────────────────────────────────────────
// diff — 타입 변경
// ──────────────────────────────────────────────
describe('diff — 엘리먼트 타입 변경', () => {
  it('div → span → REPLACE', () => {
    const oldNode = { type: 'div', props: {}, children: [] };
    const newNode = { type: 'span', props: {}, children: [] };
    expect(diff(oldNode, newNode)).toEqual([{ type: 'REPLACE', path: [], newNode }]);
  });
});

// ──────────────────────────────────────────────
// diff — props 변경
// ──────────────────────────────────────────────
describe('diff — props 변경', () => {
  it('props만 변경 → UPDATE_PROPS', () => {
    const old = { type: 'div', props: { id: 'a' }, children: [] };
    const next = { type: 'div', props: { id: 'b' }, children: [] };
    expect(diff(old, next)).toEqual([
      { type: 'UPDATE_PROPS', path: [], propsDiff: { id: 'b' } },
    ]);
  });

  it('props 동일 → 패치 없음', () => {
    const node = { type: 'div', props: { id: 'a' }, children: [] };
    expect(diff(node, { ...node })).toEqual([]);
  });
});

// ──────────────────────────────────────────────
// diff — unkeyed children
// ──────────────────────────────────────────────
describe('diff — unkeyed children', () => {
  const li = (text) => ({ type: 'li', props: {}, children: [text] });

  it('빈 자식 → 자식 없음 (변화 없음)', () => {
    const old = { type: 'ul', props: {}, children: [] };
    const next = { type: 'ul', props: {}, children: [] };
    expect(diff(old, next)).toEqual([]);
  });

  it('자식 추가 (1 → 3)', () => {
    const old = { type: 'ul', props: {}, children: [li('a')] };
    const next = { type: 'ul', props: {}, children: [li('a'), li('b'), li('c')] };
    const patches = diff(old, next);
    const creates = patches.filter((p) => p.type === 'CREATE');
    expect(creates).toHaveLength(2);
    expect(creates[0].path).toEqual([1]);
    expect(creates[1].path).toEqual([2]);
  });

  it('자식 전체 삭제 (3 → 0) — DELETE는 역순 인덱스여야 함', () => {
    const old = {
      type: 'ul',
      props: {},
      children: [li('a'), li('b'), li('c')],
    };
    const next = { type: 'ul', props: {}, children: [] };
    const patches = diff(old, next);
    const deletes = patches.filter((p) => p.type === 'DELETE');
    expect(deletes).toHaveLength(3);
    // 역순 (index 2 → 1 → 0)
    expect(deletes[0].path).toEqual([2]);
    expect(deletes[1].path).toEqual([1]);
    expect(deletes[2].path).toEqual([0]);
  });

  it('자식 일부 삭제 (3 → 1) — 남은 항목 뒤 DELETE 역순', () => {
    const old = { type: 'ul', props: {}, children: [li('a'), li('b'), li('c')] };
    const next = { type: 'ul', props: {}, children: [li('a')] };
    const patches = diff(old, next);
    const deletes = patches.filter((p) => p.type === 'DELETE');
    expect(deletes[0].path).toEqual([2]);
    expect(deletes[1].path).toEqual([1]);
  });

  it('자식 텍스트 수정', () => {
    const old = { type: 'ul', props: {}, children: [li('a'), li('b')] };
    const next = { type: 'ul', props: {}, children: [li('a'), li('X')] };
    const patches = diff(old, next);
    const textPatch = patches.find((p) => p.type === 'TEXT');
    expect(textPatch).toBeDefined();
    expect(textPatch.text).toBe('X');
  });

  it('깊은 중첩 노드 경로 검증', () => {
    const old = {
      type: 'div',
      props: {},
      children: [
        { type: 'ul', props: {}, children: [li('a'), li('b')] },
      ],
    };
    const next = {
      type: 'div',
      props: {},
      children: [
        { type: 'ul', props: {}, children: [li('a'), li('Z')] },
      ],
    };
    const patches = diff(old, next);
    // 'Z' TEXT patch path: [0, 1, 0] → ul의 두번째 li → 첫번째 텍스트
    const textPatch = patches.find((p) => p.type === 'TEXT');
    expect(textPatch?.path).toEqual([0, 1, 0]);
  });
});

// ──────────────────────────────────────────────
// diff — keyed children
// ──────────────────────────────────────────────
describe('diff — keyed children', () => {
  const kli = (key, text) => ({ type: 'li', props: {}, children: [text], key });

  it('key 순서 변경 없음 → UPDATE_PROPS 없음, TEXT 없음', () => {
    const old = { type: 'ul', props: {}, children: [kli('a', 'A'), kli('b', 'B')] };
    const next = { type: 'ul', props: {}, children: [kli('a', 'A'), kli('b', 'B')] };
    expect(diff(old, next)).toEqual([]);
  });

  it('key 없는 항목 삭제 → DELETE', () => {
    const old = { type: 'ul', props: {}, children: [kli('a', 'A'), kli('b', 'B'), kli('c', 'C')] };
    const next = { type: 'ul', props: {}, children: [kli('a', 'A'), kli('c', 'C')] };
    const patches = diff(old, next);
    const deletes = patches.filter((p) => p.type === 'DELETE');
    expect(deletes).toHaveLength(1);
    // key 'b'는 old index 1
    expect(deletes[0].path).toEqual([1]);
  });

  it('새 key 항목 추가 → CREATE', () => {
    const old = { type: 'ul', props: {}, children: [kli('a', 'A')] };
    const next = { type: 'ul', props: {}, children: [kli('a', 'A'), kli('b', 'B')] };
    const patches = diff(old, next);
    const creates = patches.filter((p) => p.type === 'CREATE');
    expect(creates).toHaveLength(1);
    expect(creates[0].newNode.key).toBe('b');
  });

  it('기존 key 내용 변경 → TEXT', () => {
    const old = { type: 'ul', props: {}, children: [kli('a', 'A'), kli('b', 'B')] };
    const next = { type: 'ul', props: {}, children: [kli('a', 'A'), kli('b', 'Z')] };
    const patches = diff(old, next);
    const text = patches.find((p) => p.type === 'TEXT');
    expect(text?.text).toBe('Z');
  });

  it('DELETE가 CREATE/UPDATE보다 먼저 나와야 함', () => {
    const old = { type: 'ul', props: {}, children: [kli('a', 'A'), kli('b', 'B'), kli('c', 'C')] };
    const next = { type: 'ul', props: {}, children: [kli('a', 'A'), kli('d', 'D')] };
    const patches = diff(old, next);
    const firstCreate = patches.findIndex((p) => p.type === 'CREATE');
    const lastDelete = patches.map((p, i) => (p.type === 'DELETE' ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
    expect(lastDelete).toBeLessThan(firstCreate);
  });

  it('전체 교체 (old 3 → new 3, 다른 key) — 3 DELETE + 3 CREATE', () => {
    const old = { type: 'ul', props: {}, children: [kli('a','A'), kli('b','B'), kli('c','C')] };
    const next = { type: 'ul', props: {}, children: [kli('x','X'), kli('y','Y'), kli('z','Z')] };
    const patches = diff(old, next);
    expect(patches.filter((p) => p.type === 'DELETE')).toHaveLength(3);
    expect(patches.filter((p) => p.type === 'CREATE')).toHaveLength(3);
  });

  it('순서만 바뀐 keyed 자식도 REPLACE로 반영', () => {
    const old = { type: 'ul', props: {}, children: [kli('a', 'A'), kli('b', 'B')] };
    const next = { type: 'ul', props: {}, children: [kli('b', 'B'), kli('a', 'A')] };
    const patches = diff(old, next);

    expect(patches).toEqual([
      { type: 'REPLACE', path: [0], newNode: next.children[0] },
      { type: 'REPLACE', path: [1], newNode: next.children[1] },
    ]);
  });
});

// ──────────────────────────────────────────────
// diff — path 매개변수
// ──────────────────────────────────────────────
describe('diff — path 전달', () => {
  it('초기 path가 결과 path에 접두됨', () => {
    const patches = diff('old', 'new', [3, 1]);
    expect(patches[0].path).toEqual([3, 1]);
  });
});
