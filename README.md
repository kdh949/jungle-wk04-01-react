# mini-react — Virtual DOM & Diff 알고리즘 구현

> 바닐라 JS로 React 핵심 개념을 직접 만들어보는 프로젝트.
> 프레임워크 없이 HTML + CSS + Vanilla JS (ES6+) 만으로 구현.

---

## 목차

1. [실행 방법](#실행-방법)
2. [구현 기능](#구현-기능)
3. [DOM이 느린 이유](#dom이-느린-이유)
4. [Virtual DOM 이란?](#virtual-dom-이란)
5. [Diff 알고리즘](#diff-알고리즘)
6. [Key 기반 최적화](#key-기반-최적화)
7. [State History](#state-history)
8. [브라우저 DOM API](#브라우저-dom-api)
9. [DOM 변화 감지 API](#dom-변화-감지-api)
10. [React에서 실제 DOM이 바뀌는 흐름](#react에서-실제-dom이-바뀌는-흐름)
11. [파일 구조](#파일-구조)
12. [테스트](#테스트)

---

## 실행 방법

```bash
npx live-server .
# 또는 index.html 을 브라우저에서 직접 열기 (서버 불필요)
```

---

## 구현 기능

| 기능 | 설명 |
|---|---|
| DOM → VNode 변환 | 실제 DOM 요소를 JS 객체 트리로 읽어들임 |
| HTML 파싱 | 실제 영역 샘플 또는 `editor-surface`에서 편집한 HTML 문자열 → VNode 트리 |
| Diff 알고리즘 | 이전/새 VNode 트리 비교 → 변경 목록(Patch[]) 생성 |
| Patch 적용 | 변경된 부분만 실제 DOM에 최소 조작으로 반영 |
| State History | 뒤로가기 / 앞으로가기로 VDOM 상태 이동 |

**사용 흐름**

```
페이지 로드
  └─ 실제 영역(preview-area)의 샘플 HTML → 초기 VNode 변환
       └─ history.push(initialVNode)
            └─ initialVNode를 테스트 영역(editor-surface)에 렌더
                 └─ initialVNode를 실제 영역에도 다시 렌더해 초기 상태 동기화

[Patch 버튼 클릭 (기본 동작)]
  └─ editor-surface innerHTML → 새 VNode (내부 key 재조정)
       └─ diff(이전 VNode, 새 VNode) → Patch[]
            └─ applyPatches(실제 영역, Patch[]) → 최소 DOM 업데이트
                 └─ history.push(새 VNode)

[에디터 수정 (Live Sync 옵션 켜짐)]
  └─ MutationObserver 감지 → 180ms debounce → commitEditorChanges()
       └─ 위 Patch 흐름을 자동 수행

[뒤로가기 / 앞으로가기]
  └─ history.back() / forward() → 해당 VNode로 실제 영역 + 테스트 영역 동시 재렌더
```

---

## DOM이 느린 이유

> DOM 조작 → Reflow → Repaint 순으로 브라우저가 화면을 다시 그림.
> 작은 변경 하나가 전체 트리 재계산을 유발할 수 있음.

### 브라우저 렌더링 파이프라인

```
JS 실행 → Style 계산 → Layout(Reflow) → Paint(Repaint) → Composite
```

| 단계 | 설명 | 비용 |
|---|---|---|
| **Layout (Reflow)** | 요소의 위치·크기 재계산. 부모 변경 시 자식 전체에 전파됨 | 매우 높음 |
| **Paint (Repaint)** | 색상·그림자 등 픽셀을 다시 그림 | 중간 |
| **Composite** | 레이어 합성 (GPU 처리) | 낮음 |

**Reflow를 유발하는 대표적인 조작들**

```js
element.style.width = '100px';   // Layout 재계산
element.offsetHeight;            // 값을 읽는 것만으로도 강제 Reflow 발생
element.innerHTML = '...';       // 전체 하위 트리 재계산
```

**Virtual DOM의 해법**
변경 사항을 메모리에서 먼저 계산하고, 실제로 바뀐 부분만 한 번에 DOM에 반영.
→ 불필요한 Reflow 횟수를 줄임.

---

## Virtual DOM 이란?

> 실제 DOM을 직접 다루는 대신, 메모리 상의 JS 객체로 UI 구조를 표현한 것.

### VNode 구조

```js
// <div class="box"><p id="title">Hello</p></div>
{
  type: 'div',
  props: { class: 'box' },
  children: [
    {
      type: 'p',
      props: { id: 'title' },
      children: ['Hello'],
      key: undefined
    }
  ],
  key: undefined
}
```

- `type` — 태그 이름 (소문자). 텍스트 노드는 `string`으로 직접 저장.
- `props` — HTML 어트리뷰트 키-값. 이벤트 핸들러는 포함하지 않음.
- `children` — 자식 배열. 문자열(텍스트) 또는 VNode.
- `key` — 리스트 비교 시 노드 추적용 고유 키.

---

## Diff 알고리즘

> 이전 VNode 트리와 새 VNode 트리를 재귀적으로 비교해 **Patch 목록**을 만듦.
> Patch는 실제 DOM에 가할 최소 조작 명세.

```js
// src/diff.js
export function diff(oldNode, newNode, path = []) {
  const patches = [];
  // ...각 케이스 판별 후 patches 반환
}
```

---

### Case 1 — 둘 다 없음: 아무것도 하지 않음

```js
if (oldNode == null && newNode == null) {
  return patches; // []
}
```

두 노드 모두 존재하지 않으면 비교할 대상이 없으므로 즉시 빈 배열 반환.

---

### Case 2 — old만 있음: DELETE

```js
if (oldNode != null && newNode == null) {
  patches.push({ type: 'DELETE', path });
  return patches;
}
```

새 트리에 해당 위치 노드가 없다 → 실제 DOM에서 제거.

```
입력:  old = <li>Item 1</li>,  new = null
출력:  [{ type: 'DELETE', path: [0] }]
```

---

### Case 3 — new만 있음: CREATE

```js
if (oldNode == null && newNode != null) {
  patches.push({ type: 'CREATE', path, newNode });
  return patches;
}
```

이전 트리에 없던 노드가 새 트리에 생겼다 → 실제 DOM에 삽입.

```
입력:  old = null,  new = <li>Item 4</li>
출력:  [{ type: 'CREATE', path: [3], newNode: {type:'li', ...} }]
```

---

### Case 4 — 둘 다 텍스트: TEXT 또는 스킵

```js
const oldIsTextNode = typeof oldNode === 'string';
const newIsTextNode = typeof newNode === 'string';

if (oldIsTextNode && newIsTextNode) {
  if (oldNode !== newNode) {
    patches.push({ type: 'TEXT', path, text: newNode });
  }
  return patches;
}
```

텍스트 내용이 바뀐 경우에만 패치 생성. 같으면 스킵.

```
입력:  old = 'Hello',  new = 'World'
출력:  [{ type: 'TEXT', path: [0, 0], text: 'World' }]

입력:  old = 'Hello',  new = 'Hello'
출력:  []  ← 변경 없음
```

> **+α 케이스**: 한쪽만 텍스트인 경우 (예: 텍스트 ↔ 엘리먼트 교체)도 REPLACE로 처리.
> ```js
> if (oldIsTextNode || newIsTextNode) {
>   patches.push({ type: 'REPLACE', path, newNode });
>   return patches;
> }
> ```

---

### Case 5 — 태그 이름이 다름: REPLACE

```js
if (oldNode.type !== newNode.type) {
  patches.push({ type: 'REPLACE', path, newNode });
  return patches;
}
```

태그 종류 자체가 바뀌면 내부 속성·자식 비교 없이 통째로 교체.
`<div>` → `<section>` 같은 경우.

```
입력:  old = { type: 'div', ... },  new = { type: 'section', ... }
출력:  [{ type: 'REPLACE', path: [0], newNode: {type:'section', ...} }]
```

---

### Case 6 — 같은 태그: 속성 비교 + 자식 재귀

같은 태그라면 **속성(props)**과 **자식(children)**을 각각 비교한다.

#### 6-1. 속성 비교 — `diffProps`

```js
// src/diff.js
export function diffProps(oldProps = {}, newProps = {}) {
  const propsDiff = {};

  // 추가되거나 값이 바뀐 속성
  Object.keys(newProps).forEach((key) => {
    if (oldProps[key] !== newProps[key]) {
      propsDiff[key] = newProps[key];
    }
  });

  // old에만 있는 속성 → null (삭제 표시)
  Object.keys(oldProps).forEach((key) => {
    if (!(key in newProps)) {
      propsDiff[key] = null;
    }
  });

  return propsDiff;
}
```

```
old props: { class: 'box', id: 'title' }
new props: { class: 'container' }

propsDiff: { class: 'container', id: null }
           ↑ 변경               ↑ 삭제 표시
```

변경된 속성이 하나라도 있으면 UPDATE_PROPS 패치 생성:

```js
const propsDiff = diffProps(oldNode.props, newNode.props);

if (Object.keys(propsDiff).length > 0) {
  patches.push({ type: 'UPDATE_PROPS', path, propsDiff });
}
```

#### 6-2. 자식 재귀 비교

```js
// key가 있는 자식이 하나라도 있으면 key 기반, 아니면 index 기반
if (hasAnyKey(oldNode.children) || hasAnyKey(newNode.children)) {
  patches.push(...diffKeyedChildren(oldNode.children, newNode.children, path));
} else {
  patches.push(...diffUnkeyedChildren(oldNode.children, newNode.children, path));
}
```

`diffUnkeyedChildren`은 공통 구간은 앞에서부터 재귀 비교하고, 삭제가 필요한 자식은 **뒤에서부터(역순)** DELETE 패치를 생성해 인덱스 밀림을 방지한다.

```js
// src/diff.js — diffUnkeyedChildren 핵심 구조
const sharedLength = Math.min(oldChildren.length, newChildren.length);

// 1) 공통 구간: index 순서대로 재귀 diff
for (let index = 0; index < sharedLength; index += 1) {
  patches.push(...diff(oldChildren[index], newChildren[index], [...path, index]));
}

// 2) old가 더 길면: 높은 인덱스부터 DELETE (역순 → index 불변)
for (let index = oldChildren.length - 1; index >= sharedLength; index -= 1) {
  patches.push({ type: 'DELETE', path: [...path, index] });
}

// 3) new가 더 길면: CREATE
for (let index = sharedLength; index < newChildren.length; index += 1) {
  patches.push({ type: 'CREATE', path: [...path, index], newNode: newChildren[index] });
}
```

---

### Patch 타입 & 실제 DOM 조작

| Patch 타입 | 발생 조건 | DOM API |
|---|---|---|
| `CREATE` | 새 노드 추가 | `insertBefore` |
| `DELETE` | 노드 삭제 | `removeChild` |
| `REPLACE` | 태그 종류 변경 | `replaceChild` |
| `UPDATE_PROPS` | 속성 추가·변경·삭제 | `setAttribute` / `removeAttribute` |
| `TEXT` | 텍스트 내용 변경 | `textContent =` |

### path 란?

루트에서 해당 노드까지 `childNodes` 인덱스를 나열한 배열.

```
path: [1, 0]
  → rootEl.firstChild           (루트 요소,  예: #sample-root)
       .childNodes[1]           (두 번째 자식, 예: ul)
           .childNodes[0]       (ul의 첫 번째 자식, 예: li)
```

---

## Key 기반 최적화

> key가 없으면 인덱스 위치만 비교 → 삭제가 앞에 있을 때 불필요한 UPDATE가 대량 발생.

### 문제: index 기반

```
Old: [li(1), li(2), li(3)]
New: [li(2), li(3)]           ← li(1) 삭제

Index 기반 diff:
  [0]: li(1) → li(2)  → UPDATE 텍스트
  [1]: li(2) → li(3)  → UPDATE 텍스트
  [2]: li(3) → 없음   → DELETE
→ DOM 조작 3회
```

### 해결: key 기반

```
Old: [li(key=1), li(key=2), li(key=3)]
New: [li(key=2), li(key=3)]

Key 기반 diff:
  key=1 → new에 없음 → DELETE
  key=2 → 동일 내용  → 패치 없음
  key=3 → 동일 내용  → 패치 없음
→ DOM 조작 1회
```

### DELETE를 역순으로 먼저 적용하는 이유

```
Old: [A(idx=0), B(idx=1), C(idx=2)]
New: [C]  → A, B 삭제

DELETE [1] 먼저, DELETE [0] 나중 (역순) 하면:
  [1] 삭제 후: [A, C]
  [0] 삭제 후: [C]  ✅

DELETE [0] 먼저, DELETE [1] 나중 (순서대로) 하면:
  [0] 삭제 후: [B, C]
  [1] 삭제 후: [B]  ❌ (C가 아니라 B가 남음)
```

DELETE 패치를 **인덱스 역순**으로 생성해야 이후 패치들의 인덱스가 깨지지 않음.

---

## State History

> 브라우저 뒤로가기/앞으로가기와 동일한 구조. **듀얼 스택**으로 구현.

```
초기:
  backStack    = [V0]       forwardStack = []

Patch → V1:
  backStack    = [V0, V1]   forwardStack = []

뒤로가기:
  backStack    = [V0]       forwardStack = [V1]   current = V0

앞으로가기:
  backStack    = [V0, V1]   forwardStack = []     current = V1

뒤로간 상태에서 Patch → V2:
  backStack    = [V0, V2]   forwardStack = []     ← 앞 히스토리 소멸
```

**왜 듀얼 스택인가?**

| | 포인터 방식 (스택 1개) | 듀얼 스택 (채택) |
|---|---|---|
| 새 상태 추가 | 포인터 뒤 데이터 전체 slice 필요 | forwardStack.length = 0 한 줄 |
| 이동 구현 | 포인터 ±1 이동 + 경계 처리 | push / pop 만으로 해결 |
| 직관성 | 현재 위치 계산 필요 | 뒤로가기 스택 / 앞으로가기 스택 명확히 분리 |

---

## 브라우저 DOM API

### Document — 요소 탐색 & 조작

```js
// 탐색
document.getElementById('id')
document.querySelector('.class')       // CSS 선택자, 첫 번째 일치
document.querySelectorAll('li')        // CSS 선택자, 전체 (NodeList)

// 생성 & 조작
const el = document.createElement('div')
el.setAttribute('class', 'box')
el.removeAttribute('id')
el.textContent = 'Hello'

parent.appendChild(el)                  // 끝에 추가
parent.insertBefore(newEl, refEl)       // refEl 앞에 삽입
parent.removeChild(el)
parent.replaceChild(newEl, oldEl)
```

### Node 타입

```js
node.nodeType === 1   // Element  (div, p, span …)
node.nodeType === 3   // Text     (텍스트 노드)

node.childNodes       // 텍스트·주석 포함 모든 자식
node.children         // Element 자식만
node.firstChild       // 첫 자식 (텍스트 포함)
node.firstElementChild // 첫 Element 자식
```

### Window

```js
window.addEventListener('load', fn)            // 모든 리소스 로드 완료
document.addEventListener('DOMContentLoaded', fn)  // HTML 파싱 완료 (이미지 전)
window.addEventListener('resize', fn)
```

---

## DOM 변화 감지 API

### MutationObserver

> DOM 트리의 변경 사항을 **비동기적**으로 감지. React의 재조정(Reconciliation)과 비슷한 용도.

```js
const observer = new MutationObserver((mutations) => {
  mutations.forEach((m) => {
    if (m.type === 'childList') {
      console.log('자식 추가/삭제:', m.addedNodes, m.removedNodes);
    }
    if (m.type === 'attributes') {
      console.log('속성 변경:', m.attributeName, '→', m.target.getAttribute(m.attributeName));
    }
    if (m.type === 'characterData') {
      console.log('텍스트 변경:', m.target.textContent);
    }
  });
});

observer.observe(targetElement, {
  childList: true,       // 자식 노드 추가·삭제
  attributes: true,      // 속성 변경
  subtree: true,         // 하위 트리 전체
  characterData: true,   // 텍스트 내용 변경
});

observer.disconnect();   // 감지 중단
```

### ResizeObserver

> 요소 크기 변화 감지. `window.resize`와 달리 **특정 요소** 단위로 감지.

```js
const ro = new ResizeObserver((entries) => {
  entries.forEach((entry) => {
    const { width, height } = entry.contentRect;
    console.log(`크기 변경: ${width} x ${height}`);
  });
});
ro.observe(element);
```

### IntersectionObserver

> 요소가 뷰포트(화면)에 진입/이탈하는 시점 감지. 무한 스크롤, 이미지 지연 로딩 등에 활용.

```js
const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      console.log('화면에 보임');
    }
  });
}, { threshold: 0.5 }); // 50% 이상 보일 때 콜백

io.observe(element);
```

---

## React에서 실제 DOM이 바뀌는 흐름

이 프로젝트는 React 전체를 구현한 것은 아니지만, 실제 DOM이 바뀌는 핵심 흐름은 축약해서 그대로 따라간다.

### 1. Render 단계

- 새 상태를 바탕으로 메모리 안에서 다음 UI 트리(Virtual DOM)를 만든다.
- 이 프로젝트에서는 `parseHTML()`과 편집 결과를 바탕으로 새 VNode 트리를 만드는 단계가 여기에 해당한다.

### 2. Reconciliation 단계

- 이전 트리와 새 트리를 비교해 무엇이 달라졌는지 계산한다.
- React는 Fiber 트리를 기준으로 비교하고, 이 프로젝트는 `diff()`로 `Patch[]`를 만든다.
- 핵심은 "바뀐 부분만 찾고 아직 DOM은 건드리지 않는다"는 점이다.

### 3. Commit 단계

- 계산이 끝난 변경 사항만 실제 DOM에 반영한다.
- React에서는 이 단계에서 DOM mutation이 일어나고, 이 프로젝트에서는 `applyPatches()`가 같은 역할을 맡는다.

```text
이전 VDOM + 새 VDOM
  -> diff / reconciliation
  -> 변경 목록 계산
  -> commit / patch
  -> 실제 DOM 업데이트
```

즉, 이 프로젝트의 대응 관계는 다음과 같다.

| React 개념 | 이 프로젝트 대응 |
|---|---|
| Virtual DOM | `VNode` |
| Reconciliation | `diff()` |
| Commit phase | `applyPatches()` |
| State history 기반 재렌더 | `history.back()` / `history.forward()` 후 `render()` |

---

## 파일 구조

```
mini-react/
├── index.html        진입점. <script type="module" src="src/main.js">
├── style.css         레이아웃 및 스타일
├── src/
│   ├── vdom.js       HTML 파싱 + DOM → VNode 변환
│   ├── history.js    듀얼 스택 히스토리 관리
│   ├── diff.js       Diff 알고리즘 (VNode 비교 → Patch[])
│   ├── patch.js      Patch 적용 (Patch[] → 실제 DOM 조작)
│   ├── renderer.js   VNode → 실제 DOM Element (초기 렌더)
│   ├── keyedVdom.js  내부 추적 key 부여 및 재조정 (reconcile)
│   └── main.js       UI 초기화, 이벤트 바인딩
└── tests/
    ├── diff.test.js        diffProps + diff 단위 테스트
    ├── history.test.js     createHistory 단위 테스트
    ├── vdom.test.js        parseHTML + domToVNode 단위 테스트
    ├── renderer.test.js    render + vnodeToHTML 단위 테스트
    ├── patch.test.js       getNodeByPath + applyPatches 단위 테스트
    └── integration.test.js diff → patch → DOM 통합 테스트
```

---

## 테스트

### 실행

```bash
npm test               # Vitest (tests/**/*.test.js)
npm run test:node      # node:test (tests/*.mjs)
npm run test:all       # 둘 다 순서대로 실행
```

### 결과 요약

**`npm run test:all` 기준 총 150개 테스트 통과**

- Vitest: 130개
- node:test (`tests/*.mjs`): 20개
- 실패: 0개

| 파일 | 테스트 수 | 주요 검증 항목 |
|---|---|---|
| `diff.test.js` | 33 | diffProps, diff 6케이스, unkeyed/keyed 자식 비교, keyed reorder |
| `history.test.js` | 20 | push/back/forward/canBack/canForward, 복합 시나리오 |
| `vdom.test.js` | 18 | parseHTML, domToVNode, 텍스트 정규화, 키 분리, 공백 필터링 |
| `renderer.test.js` | 21 | render(includeKeyAttribute 옵션 포함), vnodeToHTML 직렬화, HTML 이스케이프 |
| `patch.test.js` | 17 | getNodeByPath, applyPatches 5가지 패치 타입 |
| `integration.test.js` | 21 | diff + patch end-to-end, history + DOM, 라운드트립, keyed reorder |

---

### 모듈별 주요 테스트 케이스 및 예시

#### `diffProps` — props 변경 감지

```js
// 추가
diffProps({}, { id: 'new' })
// → { id: 'new' }

// 삭제 → null 표시
diffProps({ id: 'x', class: 'y' }, {})
// → { id: null, class: null }

// 혼합 (추가 + 변경 + 삭제)
diffProps({ id: 'old', class: 'x', 'data-remove': '1' }, { id: 'new', href: 'url' })
// → { id: 'new', href: 'url', class: null, 'data-remove': null }
```

---

#### `diff` — VNode 트리 비교 6케이스

```js
// 둘 다 null → 패치 없음
diff(null, null) // → []

// oldNode만 null → CREATE
diff(null, { type: 'div', props: {}, children: [] })
// → [{ type: 'CREATE', path: [], newNode: { type: 'div', ... } }]

// newNode만 null → DELETE
diff({ type: 'div', props: {}, children: [] }, null)
// → [{ type: 'DELETE', path: [] }]

// 다른 텍스트 → TEXT
diff('hello', 'world')
// → [{ type: 'TEXT', path: [], text: 'world' }]

// 텍스트 ↔ 엘리먼트 교체 → REPLACE
diff('text', { type: 'span', props: {}, children: [] })
// → [{ type: 'REPLACE', path: [], newNode: { type: 'span', ... } }]

// 타입 변경 → REPLACE
diff({ type: 'div', ... }, { type: 'span', ... })
// → [{ type: 'REPLACE', path: [], newNode: { type: 'span', ... } }]

// props 변경 → UPDATE_PROPS
diff({ type: 'div', props: { id: 'a' }, ... }, { type: 'div', props: { id: 'b' }, ... })
// → [{ type: 'UPDATE_PROPS', path: [], propsDiff: { id: 'b' } }]
```

---

#### `diff` — unkeyed children (인덱스 기반)

```js
// 자식 전체 삭제 → DELETE는 역순 (index-shift 방지)
diff(
  { type: 'ul', props: {}, children: [li('A'), li('B'), li('C')] },
  { type: 'ul', props: {}, children: [] }
)
// → [DELETE[2], DELETE[1], DELETE[0]]   ← 높은 인덱스부터
//    (정순이면 DELETE[0] 후 'B'가 인덱스 0으로 밀려 잘못된 노드 삭제)

// 자식 추가 → CREATE (뒤에 순서대로)
diff(
  { type: 'ul', props: {}, children: [li('A')] },
  { type: 'ul', props: {}, children: [li('A'), li('B'), li('C')] }
)
// → [CREATE path:[1] newNode:li('B'), CREATE path:[2] newNode:li('C')]
```

---

#### `diff` — keyed children (key 기반)

```js
// 중간 항목 삭제 (key='b')
diff(
  { type: 'ul', props: {}, children: [kli('a','A'), kli('b','B'), kli('c','C')] },
  { type: 'ul', props: {}, children: [kli('a','A'), kli('c','C')] }
)
// → [DELETE path:[1]]   ← key='b'의 old index

// DELETE가 CREATE/UPDATE보다 항상 먼저 옴
// → DOM index 일관성 유지
```

---

#### `domToVNode` — 텍스트 정규화

```js
// 연속 공백 → 단일 공백
makeTextNode('hello   world') → 'hello world'

// 공백 전용 → null (필터링)
makeTextNode('   \n  ') → null

// 앞뒤 공백은 trim하지 않음 (텍스트 컨텍스트 보존)
makeTextNode('  hello  ') → ' hello '

// key 속성 → props 제외, vnode.key에 저장
domToVNode(<li key="item-1">text</li>)
// → { type: 'li', props: {}, children: ['text'], key: 'item-1' }
```

---

#### `vnodeToHTML` — 공백 안전 직렬화

```js
// 텍스트 + 인라인 엘리먼트 혼합 → 줄바꿈 없음
//   (줄바꿈이 있으면 parseHTML 후 공백 텍스트 노드 생성 → 불필요한 diff 발생)
vnodeToHTML({ type: 'p', children: ['Hello ', { type: 'strong', children: ['World'] }, '!'] })
// → '<p>Hello <strong>World</strong>!</p>'   ← 한 줄

// 블록 엘리먼트 → 들여쓰기
vnodeToHTML({ type: 'ul', children: [li('A'), li('B')] })
// → '<ul>\n  <li>A</li>\n  <li>B</li>\n</ul>'

// HTML 특수문자 이스케이프
vnodeToHTML('<script>') // → '&lt;script&gt;'
```

---

#### `getNodeByPath` + `applyPatches` — DOM 탐색 및 조작

```js
// path 탐색: rootEl.firstChild → childNodes[i] 순회
// rootEl = <div><ul><li>A</li><li>B</li></ul></div>

getNodeByPath(root, [])      // → <div> (firstChild)
getNodeByPath(root, [0])     // → <ul>
getNodeByPath(root, [0, 0])  // → <li>A</li>
getNodeByPath(root, [0, 0, 0]) // → TextNode "A"
getNodeByPath(root, [0, 99]) // → null

// 패치 적용
applyPatches(root, [{ type: 'TEXT', path: [0, 0, 0], text: 'Updated' }])
// → <li>A</li> 의 텍스트가 'Updated'로 변경
```

---

#### 통합 시나리오: History + Diff + Patch

```js
const history = createHistory();
history.push({ type: 'p', children: ['state1'] });
history.push({ type: 'p', children: ['state2'] });
history.push({ type: 'p', children: ['state3'] });

// DOM에 state3 렌더 후
// back() → state2로 이동, diff → patch → DOM이 'state2'
// back() → state1로 이동, diff → patch → DOM이 'state1'
// forward() → state2로 이동, diff → patch → DOM이 'state2'
// push(state4) → forwardStack 초기화 → canForward() === false
```

---

## 최종 인수 테스트 기록 (2026-03-26)

- 최신 원격 반영 확인: `git fetch origin` 후 `git pull --ff-only origin main`으로 `origin/main`의 최신 커밋(`63fd1ab`)까지 동기화한 상태에서 재검증했다.
- VDOM 검증 범위: `parseHTML()`의 단일 루트/다중 루트/텍스트-only 입력, `domToVNode()`의 key 분리와 공백 정규화, `render()`/`vnodeToHTML()` 라운드트립을 확인했다.
- Diff/Patch 검증 범위: `CREATE`, `DELETE`, `REPLACE`, `UPDATE_PROPS`, `TEXT` 5가지 패치 타입, unkeyed 자식 역순 삭제, keyed 삭제/추가/내용 수정/순서 변경, history back/forward 경계 조건을 확인했다.
- 자동 테스트 결과: `npm run test:all` 기준 Vitest 130개 + node:test 20개, 총 150개 테스트가 모두 통과했다.

### 이슈 / PR / 커밋 기준 오류 이력

| 근거 | 발견된 문제 | 수정 내용 | 미수정 시 파급 효과 |
|---|---|---|---|
| Issue `#6`, PR `#8`, commit `72d90ab` | 자식 비교가 index 중심이라 keyed 리스트에서 삭제/삽입 시 잘못된 항목을 수정할 수 있었다. | `diffKeyedChildren()` 분기와 DELETE 우선 적용 규칙을 도입했다. | 리스트 identity가 무너져 다른 항목의 텍스트/속성이 잘못 바뀌는 회귀가 생길 수 있었다. |
| PR `#14`, commit `f325251` | unkeyed DELETE를 앞에서부터 적용하면 인덱스가 밀려 일부 노드가 DOM에 남고, mixed content 직렬화/파싱 과정에서는 불필요한 공백 patch가 생겼다. | `diffUnkeyedChildren()`의 역순 DELETE, `vnodeToHTML()` 직렬화 보정, `domToVNode()` 공백 정규화를 추가했다. | 삭제 누락으로 실제 DOM과 VDOM이 달라지고, `<p>` 같은 mixed content에서 의미 없는 줄바꿈/공백 때문에 patch가 계속 발생할 수 있었다. |
| Issue `#16`, PR `#17`, commit `f4cbe37` | README가 실제 구현보다 오래된 textarea 흐름을 설명했고, `renderer.test.js`도 `includeKeyAttribute` 옵션 동작과 어긋나 있었다. | 문서를 `editor-surface` + Live Sync 구조 기준으로 정정하고, renderer 테스트를 실제 API에 맞게 수정했다. | 유지보수자가 잘못된 UI 흐름을 기준으로 코드를 읽게 되고, 테스트 신뢰도도 함께 떨어질 수 있었다. |
| Issue `#18` | 최신 `main`에서도 keyed reorder (`[a,b] -> [b,a]`) 시 `diff()`가 빈 배열을 반환해 실제 DOM 순서가 바뀌지 않았다. | 삭제 후 남은 자식을 현재 DOM 인덱스 기준으로 다시 비교하고, 같은 위치의 `key`가 달라지면 `REPLACE` 하도록 수정했다. `tests/diff.test.js`, `tests/integration.test.js`, `tests/vdom.test.js`에 회귀 테스트를 추가했다. | preview DOM 순서와 history 기준 VDOM 순서가 어긋나 live sync 편집에서 순서 변경이 누락되고, 이후 patch 계산도 잘못된 기준 위에서 누적될 수 있었다. |
| PR `#15`, commit `144baa6` | 모듈별 회귀를 지속적으로 확인할 장치가 부족했다. | Vitest + jsdom 기반 종합 테스트 세트를 도입했고, 이번 수정으로 130개까지 확장했다. | 위 버그들이 다시 들어와도 머지 전에 잡히지 않을 가능성이 높았다. |

### 이번 최종 수정에서 직접 확인한 재현 예시

```js
const oldNode = ul([kli('a', 'A'), kli('b', 'B')]);
const newNode = ul([kli('b', 'B'), kli('a', 'A')]);

diff(oldNode, newNode);
// 수정 전  -> []
// 수정 후  -> [
//   { type: 'REPLACE', path: [0], newNode: kli('b', 'B') },
//   { type: 'REPLACE', path: [1], newNode: kli('a', 'A') }
// ]
```

> 참고: sibling 간 `key`는 여전히 **유일해야 한다**는 전제를 둔다. 중복 key는 React와 마찬가지로 비정상 입력이며, 본 프로젝트의 diff 결과도 그 경우까지 보장하지 않는다.
