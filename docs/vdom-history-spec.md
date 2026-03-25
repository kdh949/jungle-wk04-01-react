# VDOM / History Spec

## 문서 목적

이 문서는 멤버 A가 담당하는 VDOM 생성과 State History 구현 범위를 정리한 공유 문서입니다.
팀원들이 `vdom.js`, `history.js`, `diff.js`, `renderer.js`, `patch.js` 사이의 공통 인터페이스를 맞출 수 있도록 기준을 명확히 남깁니다.

## 멤버 A 담당 범위

- `src/vdom.js`
  - `parseHTML(htmlString)`
  - `domToVNode(element)`
- `src/history.js`
  - `createHistory()`

## VNode 공통 구조

```js
{
  type: 'li',
  props: { class: 'item' },
  children: ['Item 1'],
  key: '1'
}
```

### 규칙

- `type`
  - 태그 이름을 소문자 문자열로 저장합니다.
  - 텍스트 전용 VNode를 따로 만들지 않고, 텍스트는 `children` 내부 문자열로 표현합니다.
- `props`
  - 일반 HTML attribute만 저장합니다.
  - 예: `id`, `class`, `href`, `data-*`
- `children`
  - 자식 노드를 배열로 저장합니다.
  - 자식이 텍스트면 `string`, 엘리먼트면 `VNode`를 넣습니다.
- `key`
  - `props.key`로 두지 않고 `vnode.key`에 분리해서 저장합니다.
  - 리스트 diff에서 일반 속성과 구분되는 식별자 역할로 사용합니다.

### `key` 분리 기준

입력 HTML:

```html
<li key="1" class="item">Item 1</li>
```

변환 결과:

```js
{
  type: 'li',
  props: { class: 'item' },
  children: ['Item 1'],
  key: '1'
}
```

## 파싱 규칙

### `parseHTML(htmlString)`

- `DOMParser`를 사용해 HTML 문자열을 DOM으로 파싱합니다.
- 파싱 결과를 `domToVNode()`로 변환합니다.
- 루트 요소가 여러 개라면 하나의 `div`로 감싸서 반환합니다.
- 비어 있는 입력이나 공백만 있는 입력은 빈 `div` VNode로 처리하는 방향을 우선 사용합니다.

예시:

```js
{
  type: 'div',
  props: {},
  children: [],
  key: undefined
}
```

### `domToVNode(element)`

- `Element`는 VNode 객체로 변환합니다.
- `Text`는 문자열로 변환합니다.
- 줄바꿈, 들여쓰기처럼 의미 없는 공백 텍스트 노드는 제외합니다.
- attribute를 순회하면서 `key`는 별도 분리하고, 나머지는 `props`에 저장합니다.

## State History 규칙

히스토리는 포인터 방식 대신 듀얼 스택 방식으로 구현합니다.

### 내부 상태

```js
{
  backStack: [],
  forwardStack: []
}
```

### 동작 규칙

- `push(vnode)`
  - `backStack`에 현재 VNode를 push 합니다.
  - 새 상태가 들어오면 `forwardStack`은 비웁니다.
- `back()`
  - 뒤로 갈 수 있을 때만 동작합니다.
  - 현재 상태를 `forwardStack`으로 이동하고, 새 현재 상태를 반환합니다.
  - 이동 불가능하면 `null`을 반환합니다.
- `forward()`
  - 앞으로 갈 수 있을 때만 동작합니다.
  - `forwardStack`의 최신 상태를 `backStack`으로 이동하고, 새 현재 상태를 반환합니다.
  - 이동 불가능하면 `null`을 반환합니다.
- `current()`
  - `backStack`의 마지막 값을 반환합니다.
  - 비어 있으면 `null`을 반환합니다.
- `canBack()`
  - `backStack.length > 1`일 때 `true`
- `canForward()`
  - `forwardStack.length > 0`일 때 `true`

## 팀 연동 포인트

### 멤버 B: `diff.js`

- 텍스트 노드는 VNode가 아니라 `string`으로 비교해야 합니다.
- `key` 비교가 필요할 때는 `props.key`가 아니라 `oldNode.key`, `newNode.key`를 사용합니다.
- `props` 비교에서는 `key`를 제외한 일반 속성만 다루는 것을 기준으로 합니다.

### 멤버 C: `renderer.js`, `patch.js`, `main.js`

- `children` 안의 문자열은 실제 DOM `TextNode`로 렌더해야 합니다.
- 일반 attribute 반영 시 `props`만 DOM에 적용합니다.
- `key`는 내부 비교용 메타데이터로 두고, DOM 반영 대상에서는 제외하는 방향을 기본값으로 둡니다.

## 멤버 A 진행 체크리스트

### 완료 예정 작업

- `DOMParser` 기반 HTML 파서 구현
- DOM to VNode 변환 로직 구현
- `key` 분리 규칙 반영
- 듀얼 스택 history 구현

### 구현 후 확인할 테스트

- `parseHTML('<div>hello</div>')`가 올바른 VNode를 반환하는지 확인
- 중첩 태그가 정상적으로 트리 구조로 변환되는지 확인
- `key="1"`이 `props.key`가 아니라 `vnode.key`로 저장되는지 확인
- 여러 루트 노드 입력 시 `div` 래퍼가 생성되는지 확인
- `push -> back -> forward` 흐름이 정상 동작하는지 확인
- 뒤로가기 후 새 `push`가 들어오면 `forwardStack`이 비워지는지 확인

## 공유 메모

- 이 문서는 멤버 A 구현 기준 문서이면서, 멤버 B/C가 연동 시 참고하는 인터페이스 문서입니다.
- VNode 구조를 변경해야 할 경우 코드보다 먼저 이 문서를 함께 수정하고 팀에 공유합니다.
