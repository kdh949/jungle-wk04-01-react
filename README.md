# mini-react
## 목차

1. [프로젝트 소개](#프로젝트-소개)
2. [과제 요구사항 반영](#과제-요구사항-반영)
3. [실행 방법](#실행-방법)
4. [화면 구성과 동작 흐름](#화면-구성과-동작-흐름)
5. [왜 DOM 직접 조작은 느린가](#왜-dom-직접-조작은-느린가)
6. [Virtual DOM 설계](#virtual-dom-설계)
7. [Diff 알고리즘](#diff-알고리즘)
8. [Patch 적용 방식](#patch-적용-방식)
9. [State History](#state-history)
10. [브라우저 API 활용](#브라우저-api-활용)
11. [프로젝트 구조](#프로젝트-구조)
12. [테스트](#테스트)

## 프로젝트 소개

이 프로젝트의 목표는 React가 실제 DOM을 바로 조작하지 않고, 왜 Virtual DOM과 Diffing 전략을 사용하는지 직접 구현하면서 이해하는 것입니다.

- 실제 DOM을 읽어 `VNode` 트리로 변환합니다.
- 사용자가 수정한 HTML을 다시 `VNode`로 파싱합니다.
- 이전 트리와 새 트리를 비교해 `Patch[]`를 생성합니다.
- 필요한 변경만 실제 DOM에 반영합니다.
- 변경된 `VNode`를 히스토리에 저장해 `Back` / `Forward`를 지원합니다.

과제 기본 요구사항에 더해 아래 기능도 함께 구현했습니다.

- `contenteditable` 기반 테스트 영역
- `Live Sync` 토글
- Patch Inspector
- `MOVE` 패치를 포함한 key 기반 재정렬 처리
- 내부 key 복원 알고리즘

## 과제 요구사항 반영

과제 문서 기준: `docs/[WEEK04] 미니 리액트 만들기.md`

| 요구사항 | 구현 내용 |
| --- | --- |
| 실제 DOM을 Virtual DOM으로 변환 | `src/vdom.js`의 `domToVNode()` |
| HTML 문자열을 Virtual DOM으로 파싱 | `src/vdom.js`의 `parseHTML()` |
| 두 Virtual DOM 비교 | `src/diff.js`의 `diff()` |
| 변경 부분만 실제 DOM에 반영 | `src/patch.js`의 `applyPatches()` |
| 실제 영역 + 테스트 영역 + Patch / 뒤로가기 / 앞으로가기 | `index.html`, `src/main.js` |
| State History 이동 | `src/history.js`의 dual stack 구조 |
| 실제 DOM이 느린 이유, Reflow / Repaint 설명 | README 하단 이론 정리 |
| 브라우저 DOM API / 변화 감지 API 활용 | `DOMParser`, `MutationObserver`, DOM 조작 API 사용 |

과제 문서에서는 테스트 영역을 일반 입력 영역으로 설명하지만, 실제 구현에서는 발표와 시연을 더 직관적으로 만들기 위해 `textarea` 대신 `contenteditable` 기반 편집기를 사용했습니다.

## 실행 방법

빌드 도구 없이 동작하는 프로젝트이며, 테스트만 `vitest`를 사용합니다.

```bash
npm install
npx live-server .
```

또는 `index.html`을 브라우저에서 직접 열어도 됩니다.

테스트 실행:

```bash
npm test
```

추가 Node 테스트:

```bash
npm run test:node
```

## 화면 구성과 동작 흐름

### 화면 구성

- 왼쪽: 테스트 영역
- 오른쪽: 실제 영역
- 하단: Patch Inspector, History 버튼, Patch 버튼

현재 구현에서는 과제 기본 버전에 아래 UI를 더했습니다.

- `Live Sync`가 켜져 있으면 입력 후 debounce 뒤 자동 patch
- `Live Sync`가 꺼져 있으면 `Patch` 버튼으로만 반영
- Patch Inspector에서 어떤 패치가 생성됐는지 텍스트로 설명

### 동작 흐름

```text
[초기 로드]
editor HTML
  -> parseHTML()
  -> assignInternalKeys()
  -> history.push(initialVNode)
  -> render(initialVNode)

[편집 발생]
editor HTML
  -> parseHTML()
  -> reconcileInternalKeys(oldVNode, parsedVNode)
  -> diff(oldVNode, newVNode)
  -> applyPatches(previewArea, patches)
  -> history.push(newVNode)

[뒤로가기 / 앞으로가기]
history.back() / history.forward()
  -> 해당 VNode를 editor, preview에 다시 렌더
```

## 왜 DOM 직접 조작은 느린가

브라우저에서 DOM을 수정하면 단순히 노드 하나만 바뀌는 것이 아니라, 아래 렌더링 파이프라인에 영향을 줄 수 있습니다.

```text
JavaScript -> Style 계산 -> Layout(Reflow) -> Paint(Repaint) -> Composite
```

- `Reflow`: 요소의 위치와 크기를 다시 계산합니다.
- `Repaint`: 색상, 그림자, 텍스트 등 픽셀을 다시 그립니다.
- `Composite`: 레이어를 합성합니다.

예를 들어 `innerHTML` 전체를 다시 갈아끼우면 작은 수정에도 큰 범위의 재계산이 일어날 수 있습니다. 그래서 이 프로젝트는 변경점을 메모리 상의 `VNode` 트리에서 먼저 계산하고, 실제 DOM에는 필요한 조작만 반영합니다.

## Virtual DOM 설계

### VNode 구조

```js
{
  type: 'div',
  props: { class: 'container' },
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

- `type`: 태그 이름
- `props`: HTML attribute 집합
- `children`: 문자열 또는 하위 `VNode`
- `key`: 리스트 비교를 위한 식별자

### Patch 구조

과제 기본 Patch 타입은 `CREATE`, `DELETE`, `REPLACE`, `UPDATE_PROPS`, `TEXT`이지만, 현재 구현은 key 기반 재정렬을 위해 `MOVE`까지 확장했습니다.

```js
{
  type: 'MOVE',
  from: [0, 2],
  path: [0, 0]
}
```

## Diff 알고리즘

이 프로젝트의 Diff는 React의 핵심 아이디어를 참고해 `VNode` 트리를 재귀 비교하고, 그 결과를 `Patch[]`로 표현합니다.  
중요한 점은 "모든 경우를 완전 탐색"하는 것이 아니라, React처럼 예측 가능한 규칙을 두고 빠르게 비교한다는 것입니다.

### 1. React Diffing 알고리즘의 기본 5가지 유형

#### 1) Different Types

노드 타입이 다르면 같은 노드로 볼 수 없으므로 전체 교체합니다.

- 예시: `<div>` -> `<section>`
- 현재 구현: `REPLACE`

```js
if (oldNode.type !== newNode.type) {
  patches.push({ type: 'REPLACE', path, newNode });
}
```

#### 2) Same Type DOM Element

태그는 같고 속성만 달라졌다면 노드는 재사용하고 props만 수정합니다.

- 예시: `<div class="old">` -> `<div class="new">`
- 현재 구현: `diffProps()` -> `UPDATE_PROPS`

```js
const propsDiff = diffProps(oldNode.props, newNode.props);
```

#### 3) Same Type Component Element

React는 같은 컴포넌트 타입이면 인스턴스를 유지하고 props 변경에 따라 다시 렌더링합니다.  
이 프로젝트는 바닐라 JS 기반이라 함수형/클래스형 컴포넌트 계층 자체는 구현하지 않았습니다. 대신 "같은 타입이면 내부 구조를 계속 비교한다"는 아이디어를 `VNode` 수준에서 반영했습니다.

- React 개념: 같은 컴포넌트 타입 유지 + props 업데이트
- 우리 구현: 같은 태그 타입 유지 + props / children 재귀 비교

#### 4) Children Recursion

부모 노드 타입이 같으면 자식 노드도 재귀적으로 비교합니다.

```js
for (let index = 0; index < sharedLength; index += 1) {
  patches.push(...diff(oldChildren[index], newChildren[index], [...path, index]));
}
```

#### 5) Keys Optimization

리스트 비교에서 `key`가 있으면 "같은 위치"보다 "같은 아이템"을 먼저 찾을 수 있습니다.  
이 덕분에 중간 삽입, 삭제, 순서 변경을 더 정확하게 처리할 수 있습니다.

- 예시: `[a, b, c]` -> `[c, a, b]`
- 현재 구현: key 기반 매칭 + `MOVE`, `CREATE`, `DELETE`

### 2. 우리 프로젝트에서 직접 추가한 알고리즘

과제와 React 개념 설명만으로는 실제 동작이 부족해서, 아래 로직을 추가로 구현했습니다.

#### 1) `null` 비교를 통한 CREATE / DELETE 분기

React 5유형 설명만으로는 "노드가 생겼다 / 사라졌다"를 구체 패치로 표현하기 어렵습니다.  
그래서 실제 구현에서는 아래 두 케이스를 먼저 처리합니다.

```js
if (oldNode == null && newNode != null) {
  patches.push({ type: 'CREATE', path, newNode });
}

if (oldNode != null && newNode == null) {
  patches.push({ type: 'DELETE', path });
}
```

#### 2) 텍스트 노드 전용 비교

텍스트는 엘리먼트와 구조가 다르기 때문에 별도 분기가 필요합니다.

- 문자열 -> 문자열: 다르면 `TEXT`
- 문자열 <-> 엘리먼트: `REPLACE`

```js
if (typeof oldNode === 'string' && typeof newNode === 'string') {
  if (oldNode !== newNode) {
    patches.push({ type: 'TEXT', path, text: newNode });
  }
}
```

#### 3) key가 없는 자식은 index 기반으로 비교

모든 노드가 `key`를 갖는 것은 아니기 때문에, 기본 폴백 전략으로 index 기반 비교를 둡니다.

- 공통 길이 구간: 앞에서부터 재귀 비교
- 남는 old 자식: 뒤에서부터 `DELETE`
- 남는 new 자식: `CREATE`

삭제를 뒤에서부터 처리하는 이유는 앞 인덱스가 밀리는 문제를 막기 위해서입니다.

#### 4) 내부 key 복원 알고리즘

현재 프로젝트는 사용자가 `contenteditable` 영역을 직접 수정합니다. 이 과정에서 React처럼 안정적인 `key`가 항상 유지되지 않을 수 있습니다.  
그래서 `src/keyedVdom.js`에서 내부 추적용 key를 자동 부여하고, 새 편집본이 들어오면 이전 트리와 가장 비슷한 노드에 key를 다시 연결합니다.

- `assignInternalKeys()`: 초기 트리에 내부 key 부여
- `reconcileInternalKeys()`: 이전 트리와 새 트리를 매칭해 key 복원

이 덕분에 사용자가 key를 직접 관리하지 않아도 key 기반 diff를 계속 활용할 수 있습니다.

#### 5) `MOVE` 패치 추가

과제 기본 Patch 구조에는 없지만, key 기반 재정렬을 실제 DOM에 더 자연스럽게 반영하기 위해 `MOVE`를 추가했습니다.

```js
{
  type: 'MOVE',
  from: [...path, currentIndex],
  path: [...path, nextIndex]
}
```

이 패치는 "노드를 지우고 새로 만드는" 방식보다 DOM 재사용 측면에서 더 효율적입니다.

#### 6) Patch 적용 순서 최적화

key 기반 자식 비교는 패치 적용 순서가 중요합니다. 현재 구현은 아래 순서를 따릅니다.

1. `DELETE`
2. `MOVE` / `CREATE`
3. `UPDATE_PROPS` / `TEXT`

이 순서를 지켜야 path가 인덱스 기준이어도 중간 참조가 틀어지지 않습니다.

### 3. 실제 구현의 전체 Diff 흐름

```js
diff(oldNode, newNode, path = [])
  1. 둘 다 null -> []
  2. old만 존재 -> DELETE
  3. new만 존재 -> CREATE
  4. 둘 다 텍스트 -> TEXT 또는 []
  5. 한쪽만 텍스트 -> REPLACE
  6. type 다름 -> REPLACE
  7. props 비교 -> UPDATE_PROPS
  8. children 비교
     - key 존재 -> diffKeyedChildren()
     - key 없음 -> diffUnkeyedChildren()
```

## Patch 적용 방식

`src/patch.js`는 `Patch[]`를 실제 DOM 조작으로 바꾸는 모듈입니다.

- `CREATE`: `insertBefore`
- `DELETE`: `removeChild`
- `MOVE`: `insertBefore`
- `REPLACE`: `replaceChild`
- `UPDATE_PROPS`: `setAttribute`, `removeAttribute`
- `TEXT`: `textContent`

핵심은 전체 `innerHTML`을 다시 쓰지 않고, 경로(`path`)를 따라 필요한 노드만 찾아 최소 조작을 수행한다는 점입니다.

## State History

히스토리는 dual stack 구조로 구현했습니다.

```text
backStack    = [현재까지의 상태]
forwardStack = [되돌린 상태]
```

- `push(vnode)`: 새 상태 저장, `forwardStack` 비움
- `back()`: 현재 상태를 `forwardStack`으로 옮기고 이전 상태 반환
- `forward()`: `forwardStack`의 상태를 다시 `backStack`으로 복원

이 구조 덕분에 patch 이후 상태 이동을 단순하게 관리할 수 있습니다.

## 브라우저 API 활용

과제의 중점 포인트에 맞춰 아래 브라우저 API를 직접 사용했습니다.

- `DOMParser`: HTML 문자열 -> DOM 파싱
- `MutationObserver`: 테스트 영역 변화 감지
- `childNodes`, `attributes`, `textContent`: DOM 읽기
- `createElement`, `createTextNode`: 실제 DOM 생성
- `insertBefore`, `removeChild`, `replaceChild`: Patch 반영
- `contenteditable`: 테스트 영역 직접 편집

## 프로젝트 구조

```text
.
├── index.html
├── style.css
├── src
│   ├── vdom.js
│   ├── diff.js
│   ├── patch.js
│   ├── renderer.js
│   ├── history.js
│   ├── keyedVdom.js
│   └── main.js
├── tests
│   ├── vdom.test.js
│   ├── diff.test.js
│   ├── patch.test.js
│   ├── renderer.test.js
│   ├── history.test.js
│   └── integration.test.js
└── docs
```

## 테스트

핵심 로직은 단위 테스트와 통합 테스트로 검증합니다.

### 단위 테스트

- `vdom`: HTML 파싱, DOM -> VNode 변환
- `diff`: props 비교, text 비교, type 비교, keyed / unkeyed children
- `patch`: path 탐색, CREATE / DELETE / MOVE / TEXT / REPLACE
- `renderer`: VNode -> DOM 변환, HTML 직렬화
- `history`: push / back / forward / canBack / canForward

### 통합 테스트

- `diff -> applyPatches -> DOM` 전체 흐름
- History 이동 후 DOM 일치 여부
- key 기반 자식 재정렬
- 직렬화 / 재파싱 시 공백 안정성

실행 명령:

```bash
npm test
```

## 정리

이 프로젝트는 React의 Diffing 아이디어를 그대로 흉내 내는 데서 멈추지 않고, 실제 브라우저 편집 환경에서 동작하도록 여러 보조 알고리즘까지 확장한 mini-react입니다.

- React의 기본 Diffing 5유형을 이해할 수 있습니다.
- `VNode -> Diff -> Patch` 흐름을 직접 추적할 수 있습니다.
- key, history, DOM 최소 조작이 왜 중요한지 실제로 확인할 수 있습니다.

발표에서는 아래 순서로 설명하면 흐름이 가장 자연스럽습니다.

1. 왜 DOM 직접 조작이 비효율적인가
2. Virtual DOM을 어떤 구조로 표현했는가
3. Diff를 React 기본 5유형과 우리 확장 알고리즘으로 어떻게 나눴는가
4. Patch가 실제 DOM에 어떻게 최소 반영되는가
5. History와 테스트로 어떻게 검증했는가
