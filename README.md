# mini-react

바닐라 JS로 React의 핵심인 **Virtual DOM**과 **Diff 알고리즘**을 직접 구현한 프로젝트입니다.

## 실행 방법

```bash
# live-server 또는 브라우저에서 직접 파일 열기
npx live-server .
```

> 서버 없이 `index.html`을 직접 브라우저에서 열어도 동작합니다 (100% CSR).

---

## 프로젝트 구조

```
mini-react/
├── index.html          # 진입점
├── style.css           # 레이아웃 및 스타일
└── src/
    ├── vdom.js         # HTML 파싱, DOM → VNode 변환
    ├── history.js      # 듀얼 스택 히스토리 관리
    ├── diff.js         # Diff 알고리즘 (VNode 비교 → Patch[])
    ├── patch.js        # Patch 적용 (Patch[] → 실제 DOM 조작)
    ├── renderer.js     # VNode → 실제 DOM Element 생성
    └── main.js         # UI 초기화, 이벤트 바인딩
```

---

## 핵심 개념

### Virtual DOM이란?

브라우저의 실제 DOM을 그대로 다루는 대신, 메모리 상의 JavaScript 객체 트리로 UI 상태를 표현합니다.

```js
// <div class="box"><p>Hello</p></div> 를 VNode로 표현
{
  type: 'div',
  props: { class: 'box' },
  children: [
    { type: 'p', props: {}, children: ['Hello'], key: undefined }
  ],
  key: undefined
}
```

변경이 필요할 때 새 VNode 트리를 만들고, 이전 트리와 비교(Diff)하여 **최소한의 실제 DOM 조작**만 수행합니다.

---

### DOM이 느린 이유 — Reflow와 Repaint

| 단계 | 설명 | 비용 |
|---|---|---|
| **Reflow** (Layout) | 요소의 위치/크기 재계산 | 매우 높음 |
| **Repaint** | 픽셀을 화면에 다시 그림 | 중간 |
| **Composite** | 레이어 합성 | 낮음 |

`element.style.width = '100px'` 한 줄이 **전체 트리의 Reflow**를 유발할 수 있습니다.
Virtual DOM은 변경 사항을 모아 **한 번에** 실제 DOM에 반영하여 불필요한 Reflow를 줄입니다.

---

### 브라우저에서 DOM 다루는 방법

#### Document

```js
// 요소 탐색
document.getElementById('id')
document.querySelector('.class')
document.querySelectorAll('li')

// 요소 생성 및 조작
const el = document.createElement('div')
el.setAttribute('class', 'box')
parent.appendChild(el)
parent.removeChild(el)
parent.replaceChild(newEl, oldEl)
parent.insertBefore(newEl, referenceEl)
```

#### Window

```js
// 전역 이벤트
window.addEventListener('load', handler)
window.addEventListener('resize', handler)

// DOM 준비 완료 시
document.addEventListener('DOMContentLoaded', handler)
```

#### Node 타입

```js
node.nodeType === 1   // Element
node.nodeType === 3   // Text
node.childNodes       // 모든 자식 (텍스트 포함)
node.children         // Element 자식만
```

---

### 실제 DOM 변화 감지 브라우저 API

#### MutationObserver

DOM 트리의 변경 사항을 비동기적으로 감지합니다.

```js
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList') {
      console.log('자식 노드 변경:', mutation.addedNodes, mutation.removedNodes);
    }
    if (mutation.type === 'attributes') {
      console.log('속성 변경:', mutation.attributeName);
    }
  });
});

observer.observe(targetElement, {
  childList: true,      // 자식 노드 추가/삭제 감지
  attributes: true,     // 속성 변경 감지
  subtree: true,        // 하위 트리 전체 감지
  characterData: true,  // 텍스트 변경 감지
});

observer.disconnect(); // 감지 중단
```

#### ResizeObserver

요소의 크기 변화를 감지합니다.

```js
const resizeObserver = new ResizeObserver((entries) => {
  entries.forEach((entry) => {
    console.log('크기 변경:', entry.contentRect.width, entry.contentRect.height);
  });
});
resizeObserver.observe(element);
```

#### IntersectionObserver

뷰포트와 요소의 교차 여부를 감지합니다 (무한 스크롤, 지연 로딩 등에 활용).

```js
const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) console.log('화면에 보임');
  });
});
io.observe(element);
```

---

## Diff 알고리즘

두 VNode 트리를 재귀적으로 비교하여 최소 변경 목록(`Patch[]`)을 생성합니다.

### 5가지 비교 케이스

```
function diff(oldNode, newNode, path):

  // Case 1: 둘 다 없음 → 아무것도 하지 않음
  if oldNode == null AND newNode == null:
    return []

  // Case 2: old는 있는데 new가 없음 → 삭제
  if oldNode != null AND newNode == null:
    return [{ type: 'DELETE', path }]

  // Case 3: old는 없는데 new가 생김 → 생성
  if oldNode == null AND newNode != null:
    return [{ type: 'CREATE', path, newNode }]

  // Case 4: 둘 다 텍스트 노드
  if typeof oldNode == 'string' AND typeof newNode == 'string':
    if oldNode != newNode:
      return [{ type: 'TEXT', path, text: newNode }]
    return []

  // Case 5: 태그 이름이 다름 → 교체
  if oldNode.type != newNode.type:
    return [{ type: 'REPLACE', path, newNode }]

  // Case 6: 같은 태그 → 속성 비교 + 자식 재귀 비교
  patches = []
  propsDiff = diffProps(oldNode.props, newNode.props)
  if propsDiff 변경 있음:
    patches += [{ type: 'UPDATE_PROPS', path, propsDiff }]

  for i in max(old.children.length, new.children.length):
    patches += diff(old.children[i], new.children[i], [...path, i])

  return patches
```

### Patch 타입

| 타입 | 설명 | DOM 조작 |
|---|---|---|
| `CREATE` | 새 노드 추가 | `insertBefore` |
| `DELETE` | 노드 삭제 | `removeChild` |
| `REPLACE` | 노드 교체 (태그 변경) | `replaceChild` |
| `UPDATE_PROPS` | 속성 변경/삭제 | `setAttribute` / `removeAttribute` |
| `TEXT` | 텍스트 내용 변경 | `textContent` |

---

## Key 기반 최적화

리스트 첫 번째 항목을 삭제하는 경우:

**Index 기반 (비효율):**
```
[li A, li B, li C] → [li B, li C]
패치: UPDATE(A→B), UPDATE(B→C), DELETE(C)  // 조작 3회
```

**Key 기반 (최적):**
```
[li(key=A), li(key=B), li(key=C)] → [li(key=B), li(key=C)]
패치: DELETE(key=A)  // 조작 1회
```

Key 기반 diff는 DELETE 패치를 역순 인덱스로 먼저 적용하여 이후 패치의 인덱스 무결성을 보장합니다.

---

## State History (듀얼 스택)

브라우저 뒤로가기/앞으로가기와 동일한 방식으로 VDOM 상태를 관리합니다.

```
초기:            backStack = [V0],       forwardStack = []
Patch (V1):      backStack = [V0, V1],   forwardStack = []
뒤로가기:         backStack = [V0],       forwardStack = [V1]
앞으로가기:       backStack = [V0, V1],   forwardStack = []
Patch (V2):      backStack = [V0, V2],   forwardStack = []  ← 앞 히스토리 소멸
```

| 방식 | 구현 난이도 | 새 페이지 추가 | 직관성 |
|---|---|---|---|
| 포인터 방식 (Single Stack) | 포인터 연산 + 배열 절단 필요 | 포인터 이후 전체 삭제 | 낮음 |
| **듀얼 스택 (채택)** | push/pop만으로 해결 | forwardStack만 비우면 됨 | 높음 |
