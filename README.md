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
10. [파일 구조](#파일-구조)

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
| HTML 파싱 | `textarea`에 입력한 HTML 문자열 → VNode 트리 |
| Diff 알고리즘 | 이전/새 VNode 트리 비교 → 변경 목록(Patch[]) 생성 |
| Patch 적용 | 변경된 부분만 실제 DOM에 최소 조작으로 반영 |
| State History | 뒤로가기 / 앞으로가기로 VDOM 상태 이동 |

**사용 흐름**

```
페이지 로드
  └─ 실제 영역 DOM → VNode 변환 → 테스트 영역(textarea)에 HTML 표시

[Patch 버튼 클릭]
  └─ textarea HTML → 새 VNode
       └─ diff(이전 VNode, 새 VNode) → Patch[]
            └─ applyPatches(실제 영역, Patch[]) → 최소 DOM 업데이트
                 └─ history.push(새 VNode)

[뒤로가기 / 앞으로가기]
  └─ history.back() / forward() → 해당 VNode로 실제 영역 재렌더
       └─ 테스트 영역도 함께 동기화
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
  const maxChildrenLength = Math.max(
    oldNode.children.length,
    newNode.children.length,
  );

  for (let index = 0; index < maxChildrenLength; index += 1) {
    patches.push(
      ...diff(
        oldNode.children[index] ?? null,  // 없으면 null → Case 2/3로 처리
        newNode.children[index] ?? null,
        [...path, index],                 // 경로에 자식 인덱스 추가
      ),
    );
  }
}
```

자식 개수가 다를 때 `?? null`로 채워서 Case 2(DELETE) 또는 Case 3(CREATE)이 자연스럽게 처리되게 함.

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

## 파일 구조

```
mini-react/
├── index.html        진입점. <script type="module" src="src/main.js">
├── style.css         레이아웃 및 스타일
└── src/
    ├── vdom.js       HTML 파싱 + DOM → VNode 변환
    ├── history.js    듀얼 스택 히스토리 관리
    ├── diff.js       Diff 알고리즘 (VNode 비교 → Patch[])
    ├── patch.js      Patch 적용 (Patch[] → 실제 DOM 조작)
    ├── renderer.js   VNode → 실제 DOM Element (초기 렌더)
    └── main.js       UI 초기화, 이벤트 바인딩
```
