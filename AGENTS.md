# AGENTS.md — Mini React 프로젝트 AI 참조 문서

> **AI 에이전트에게:** 이 문서는 mini-react 프로젝트의 단일 소스 오브 트루스입니다.
> 구현 전 반드시 전체를 읽고, 공유 데이터 구조와 함수 시그니처를 그대로 따르세요.
> 팀원 간 인터페이스가 맞지 않으면 통합이 불가능합니다.

---

## 1. 프로젝트 개요

바닐라 JS(HTML + CSS + JavaScript, 프레임워크 없음)로 React의 핵심 개념인 **Virtual DOM**과 **Diff 알고리즘**을 직접 구현합니다.

### 완성 기능 목록
- HTML 문자열 → VNode 트리 파싱
- 실제 DOM Element → VNode 트리 변환
- 두 VNode 트리 비교 → Patch 목록 생성 (Diff)
- Patch 목록을 실제 DOM에 최소한으로 적용 (Patch)
- VDOM 상태 히스토리 관리 (뒤로가기 / 앞으로가기)
- UI: 실제 영역 + 테스트 영역(textarea) + Patch/뒤로가기/앞으로가기 버튼

### 기술 스택
- **언어:** JavaScript (Vanilla ES6+)
- **빌드 도구:** 없음 (모듈은 `<script type="module">` 사용)
- **서버:** 없음 (100% CSR, 파일을 브라우저에서 직접 열거나 live-server 사용)

---

## 2. 파일 구조

```
mini-react/
├── index.html          # 진입점. <script type="module" src="src/main.js">
├── style.css           # 전체 레이아웃 및 스타일
└── src/
    ├── vdom.js         # [담당: 멤버 A] HTML 파싱, DOM → VNode 변환
    ├── history.js      # [담당: 멤버 A] 듀얼 스택 히스토리 관리
    ├── diff.js         # [담당: 멤버 B] Diff 알고리즘 (VNode 비교 → Patch[])
    ├── patch.js        # [담당: 멤버 C] Patch 적용 (Patch[] → 실제 DOM 조작)
    ├── renderer.js     # [담당: 멤버 C] VNode → 실제 DOM Element 생성 (초기 렌더)
    └── main.js         # [담당: 멤버 C] UI 초기화, 이벤트 바인딩
```

---

## 3. 공유 데이터 구조

> **경고:** 이 섹션은 팀 전체의 계약입니다. 임의로 구조를 변경하지 마세요.
> 변경이 필요하면 팀과 합의 후 이 문서도 함께 수정하세요.

### 3.1 VNode

Virtual DOM 트리의 단일 노드입니다.

```js
/**
 * @typedef {Object} VNode
 * @property {string} type
 *   태그 이름 (소문자). 예: 'div', 'p', 'span', 'ul', 'li'
 *   텍스트 노드는 type = '#text'
 * @property {Object.<string, string>} props
 *   HTML 어트리뷰트 키-값 쌍. 예: { class: 'box', id: 'main', href: '#' }
 *   이벤트 핸들러는 포함하지 않음.
 * @property {Array.<VNode|string>} children
 *   자식 배열. 텍스트 노드는 string으로 직접 포함. 예: ['Hello', { type: 'b', ... }]
 * @property {string} [key]
 *   리스트 렌더링 시 노드 추적용 고유 키. 없으면 undefined.
 */
```

**VNode 예시:**
```js
// <div class="container"><p id="title">Hello</p></div>
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

### 3.2 Patch

Diff 알고리즘이 생성하고, Patch 적용 함수가 소비하는 변경 기술자입니다.

```js
/**
 * @typedef {'CREATE' | 'DELETE' | 'REPLACE' | 'UPDATE_PROPS' | 'TEXT'} PatchType
 *
 * @typedef {Object} Patch
 * @property {PatchType} type - 변경 유형
 * @property {number[]} path
 *   루트에서 해당 노드까지의 childNodes 인덱스 경로.
 *   예: [0, 2, 1] → 루트의 0번째 자식의 2번째 자식의 1번째 자식
 * @property {VNode} [newNode]
 *   type이 CREATE 또는 REPLACE일 때 새로 삽입/교체할 VNode
 * @property {Object.<string, string|null>} [propsDiff]
 *   type이 UPDATE_PROPS일 때 변경된 속성 맵.
 *   값이 null이면 해당 속성을 제거. 예: { class: 'new-class', id: null }
 * @property {string} [text]
 *   type이 TEXT일 때 새 텍스트 내용
 */
```

**Patch 예시:**
```js
// p 태그의 텍스트가 'Hello' → 'World'로 바뀐 경우
{ type: 'TEXT', path: [0, 0], text: 'World' }

// div의 class 속성이 변경되고, id 속성이 삭제된 경우
{ type: 'UPDATE_PROPS', path: [0], propsDiff: { class: 'new-class', id: null } }

// 두 번째 자식 노드가 새로 추가된 경우
{ type: 'CREATE', path: [1], newNode: { type: 'span', props: {}, children: ['new'] } }

// 특정 노드가 삭제된 경우
{ type: 'DELETE', path: [2] }

// 태그 종류가 바뀐 경우 (div → section)
{ type: 'REPLACE', path: [1], newNode: { type: 'section', props: {}, children: [] } }
```

---

## 4. 모듈별 함수 시그니처

### 4.1 `src/vdom.js` — 담당: 멤버 A

```js
/**
 * HTML 문자열을 파싱하여 VNode 트리를 반환합니다.
 * DOMParser를 사용해 파싱한 뒤 domToVNode()를 호출합니다.
 *
 * @param {string} htmlString - 파싱할 HTML 문자열
 * @returns {VNode} 루트 VNode. 여러 루트 요소가 있으면 div로 감쌀 것.
 */
export function parseHTML(htmlString) {}

/**
 * 실제 DOM Element를 VNode로 변환합니다.
 * 재귀적으로 자식 노드를 순회합니다.
 * Node.TEXT_NODE는 string으로, Element는 VNode로 변환합니다.
 *
 * @param {Element|Text} element - 변환할 DOM 노드
 * @returns {VNode|string} 변환된 VNode 또는 텍스트 문자열
 */
export function domToVNode(element) {}
```

### 4.2 `src/history.js` — 담당: 멤버 A

```js
/**
 * 듀얼 스택 기반 히스토리 관리자를 생성합니다.
 *
 * 내부 상태:
 *   backStack: VNode[]   — 뒤로가기 스택 (현재 상태 포함)
 *   forwardStack: VNode[] — 앞으로가기 스택
 *
 * @returns {{
 *   push: (vnode: VNode) => void,
 *   back: () => VNode|null,
 *   forward: () => VNode|null,
 *   current: () => VNode|null,
 *   canBack: () => boolean,
 *   canForward: () => boolean
 * }}
 */
export function createHistory() {}
```

**히스토리 동작 규칙:**
- `push(vnode)`: backStack에 push. **forwardStack을 비웁니다.**
- `back()`: backStack에서 pop하여 forwardStack에 push. 새 현재 상태(backStack 꼭대기)를 반환.
- `forward()`: forwardStack에서 pop하여 backStack에 push. 새 현재 상태를 반환.
- `current()`: backStack의 꼭대기를 반환. 비어있으면 null.
- 스택이 비어 이동 불가능할 때 null을 반환합니다.

### 4.3 `src/diff.js` — 담당: 멤버 B

```js
/**
 * 두 VNode 트리를 비교하여 변경 사항(Patch) 목록을 반환합니다.
 * 재귀적으로 트리를 탐색하며, 경로(path)를 누적합니다.
 *
 * @param {VNode|string|null} oldNode - 이전 VNode (없으면 null)
 * @param {VNode|string|null} newNode - 새 VNode (없으면 null)
 * @param {number[]} [path=[]] - 현재 노드까지의 경로 (재귀 내부용)
 * @returns {Patch[]} 변경 사항 목록
 */
export function diff(oldNode, newNode, path = []) {}

/**
 * 두 props 객체를 비교하여 변경된 속성 맵을 반환합니다.
 * diff() 내부에서 사용하는 헬퍼 함수입니다.
 *
 * @param {Object.<string, string>} oldProps
 * @param {Object.<string, string>} newProps
 * @returns {Object.<string, string|null>} 변경된 속성 맵 (null = 삭제)
 */
export function diffProps(oldProps, newProps) {}
```

### 4.4 `src/patch.js` — 담당: 멤버 C

```js
/**
 * Patch 목록을 받아 루트 DOM 요소에 최소한의 조작으로 반영합니다.
 *
 * @param {Element} rootEl - 패치를 적용할 실제 DOM 루트 요소
 * @param {Patch[]} patches - diff()가 반환한 Patch 목록
 * @returns {void}
 */
export function applyPatches(rootEl, patches) {}

/**
 * path 배열을 따라 rootEl 하위에서 실제 DOM 노드를 찾아 반환합니다.
 * applyPatches() 내부에서 사용하는 헬퍼 함수입니다.
 *
 * @param {Element} rootEl - 탐색 시작 루트
 * @param {number[]} path - childNodes 인덱스 배열
 * @returns {Node|null} 해당 경로의 DOM 노드
 */
export function getNodeByPath(rootEl, path) {}
```

### 4.5 `src/renderer.js` — 담당: 멤버 C

```js
/**
 * VNode를 실제 DOM Element로 변환합니다 (초기 렌더링용).
 * 재귀적으로 자식 노드를 생성하여 appendChild합니다.
 *
 * @param {VNode|string} vnode - 렌더링할 VNode 또는 텍스트
 * @returns {Element|Text} 생성된 실제 DOM 노드
 */
export function render(vnode) {}
```

### 4.6 `src/main.js` — 담당: 멤버 C

```js
// main.js는 export 없이 UI를 초기화하는 진입점입니다.
// 아래 로직을 순서대로 구현하세요.

// 1. DOM 요소 참조 획득
//    const realArea     = document.getElementById('real-area')
//    const testTextarea = document.getElementById('test-textarea')
//    const patchBtn     = document.getElementById('btn-patch')
//    const backBtn      = document.getElementById('btn-back')
//    const forwardBtn   = document.getElementById('btn-forward')

// 2. 초기화 (페이지 로드 시)
//    a. realArea의 초기 HTML을 domToVNode()로 변환 → initialVNode
//    b. history.push(initialVNode)
//    c. render(initialVNode)로 실제 영역 초기 렌더링
//    d. testTextarea 초기값 = realArea.innerHTML (초기 HTML 문자열)

// 3. Patch 버튼 클릭 핸들러
//    a. testTextarea.value를 parseHTML()로 변환 → newVNode
//    b. history.current()로 oldVNode 획득
//    c. diff(oldVNode, newVNode)로 patches 생성
//    d. applyPatches(realArea, patches)로 실제 영역 업데이트
//    e. history.push(newVNode)
//    f. 버튼 활성화 상태 업데이트

// 4. 뒤로가기 버튼 클릭 핸들러
//    a. history.back()으로 이전 VNode 획득
//    b. realArea.innerHTML = '' 후 render()로 재렌더
//    c. testTextarea.value = realArea.innerHTML 동기화
//    d. 버튼 활성화 상태 업데이트

// 5. 앞으로가기 버튼 클릭 핸들러 (뒤로가기와 대칭)

// 6. updateButtonState() 헬퍼
//    backBtn.disabled    = !history.canBack()
//    forwardBtn.disabled = !history.canForward()
```

---

## 5. Diff 알고리즘 수도코드 (5 케이스)

```
function diff(oldNode, newNode, path):
  patches = []

  // Case 1: 둘 다 없음 → 아무것도 하지 않음
  if oldNode == null AND newNode == null:
    return []

  // Case 2: old는 있는데 new가 없음 → 삭제
  if oldNode != null AND newNode == null:
    patches.push({ type: 'DELETE', path })
    return patches

  // Case 3: old는 없는데 new가 생김 → 생성
  if oldNode == null AND newNode != null:
    patches.push({ type: 'CREATE', path, newNode })
    return patches

  // Case 4: 둘 다 텍스트 노드
  if typeof oldNode == 'string' AND typeof newNode == 'string':
    if oldNode != newNode:
      patches.push({ type: 'TEXT', path, text: newNode })
    return patches

  // Case 5: 태그 이름이 다름 → 교체
  if oldNode.type != newNode.type:
    patches.push({ type: 'REPLACE', path, newNode })
    return patches

  // Case 6: 같은 태그 → 속성 비교 + 자식 재귀 비교
  propsDiff = diffProps(oldNode.props, newNode.props)
  if Object.keys(propsDiff).length > 0:
    patches.push({ type: 'UPDATE_PROPS', path, propsDiff })

  maxLen = max(oldNode.children.length, newNode.children.length)
  for i = 0 to maxLen - 1:
    childPatches = diff(
      oldNode.children[i] ?? null,
      newNode.children[i] ?? null,
      [...path, i]
    )
    patches = patches.concat(childPatches)

  return patches
```

```
function diffProps(oldProps, newProps):
  diff = {}

  // 추가되거나 변경된 속성
  for key in newProps:
    if oldProps[key] != newProps[key]:
      diff[key] = newProps[key]

  // 삭제된 속성 (null로 표시)
  for key in oldProps:
    if key not in newProps:
      diff[key] = null

  return diff
```

---

## 6. State History 설계 (듀얼 스택)

```
초기 상태:
  backStack    = [ VNode_0 ]   ← 초기 VDOM
  forwardStack = []

Patch 후 (VNode_1로 업데이트):
  backStack    = [ VNode_0, VNode_1 ]
  forwardStack = []

뒤로가기 1회:
  pop VNode_1 from backStack → push to forwardStack
  backStack    = [ VNode_0 ]
  forwardStack = [ VNode_1 ]
  current      = VNode_0

앞으로가기 1회:
  pop VNode_1 from forwardStack → push to backStack
  backStack    = [ VNode_0, VNode_1 ]
  forwardStack = []
  current      = VNode_1

중간에 새 VNode_2 추가 (뒤로가기 상태에서 Patch):
  push VNode_2 to backStack + forwardStack 비우기
  backStack    = [ VNode_0, VNode_2 ]
  forwardStack = []   ← 앞으로가기 히스토리 소멸
```

---

## 7. 네이밍 컨벤션 & 코드 스타일

### 변수 / 함수
| 종류 | 규칙 | 예시 |
|------|------|------|
| 함수 | camelCase 동사+명사 | `parseHTML`, `applyPatches`, `createHistory` |
| 변수 | camelCase | `oldNode`, `newVNode`, `backStack` |
| 상수 | UPPER_SNAKE_CASE | `PATCH_TYPE`, `MAX_HISTORY` |
| DOM 요소 변수 | camelCase + `El` 접미사 | `realAreaEl`, `testTextareaEl` |

### 파일
- 모든 소스 파일은 `src/` 폴더 하위에 위치
- 파일명은 소문자 camelCase (예: `vdom.js`, `diff.js`)

### HTML ID / Class
- ID: kebab-case (예: `real-area`, `test-textarea`, `btn-patch`)
- Class: kebab-case (예: `panel`, `btn-group`, `active`)

### 코드 스타일
- `const` 우선, 재할당 필요 시 `let`. `var` 사용 금지.
- 화살표 함수 사용 권장
- 세미콜론 사용
- 들여쓰기: 스페이스 2칸
- 모듈 간 통신은 반드시 `export` / `import` 사용 (전역 변수 금지)

---

## 8. UI 레이아웃

```
┌─────────────────────────────────────────────────────────────┐
│                        mini-react                           │
├──────────────────────────┬──────────────────────────────────┤
│      실제 영역 (좌측)      │      테스트 영역 (우측)            │
│  id="real-area"          │  id="test-area"                  │
│                          │                                  │
│  [렌더링된 DOM 표시]       │  <textarea id="test-textarea">  │
│                          │    [HTML 직접 편집]               │
│                          │  </textarea>                     │
│                          │                                  │
├──────────────────────────┴──────────────────────────────────┤
│   [ 뒤로가기 ]      [ Patch ]      [ 앞으로가기 ]             │
│  id="btn-back"   id="btn-patch"  id="btn-forward"           │
└─────────────────────────────────────────────────────────────┘
```

### 초기 샘플 HTML (실제 영역 초기값)
```html
<div id="sample-root">
  <h1 class="title">Hello, Virtual DOM!</h1>
  <ul>
    <li key="1">Item 1</li>
    <li key="2">Item 2</li>
    <li key="3">Item 3</li>
  </ul>
  <p>Edit the textarea on the right and click <strong>Patch</strong>.</p>
</div>
```

---

## 9. Git / GitHub 워크플로우

> **AI 에이전트에게:** 코드 작성 전후로 반드시 아래 절차를 따르세요.
> 순서를 건너뛰면 팀원이 변경 이력을 추적할 수 없습니다.

### 9.1 작업 시작 전 — 이슈 생성

1. GitHub 리포지토리에 **Issue를 먼저 생성**합니다.
2. 이슈 제목: `[기능명] 한 줄 설명` (예: `[vdom] parseHTML 함수 구현`)
3. 이슈 본문에 포함할 내용:
   - 구현할 기능 또는 수정 목표
   - 예상 동작 / 완료 조건 (Acceptance Criteria)
4. 생성된 이슈 번호(예: `#7`)를 기억해 둡니다.

### 9.2 브랜치 생성 규칙

- **항상 새 브랜치**를 만들어 작업합니다. main 브랜치에 직접 커밋 금지.
- 브랜치명 형식: `{타입}/{이슈번호}-{짧은-설명}`

| 타입 | 사용 시기 | 예시 |
|------|-----------|------|
| `feat` | 새 기능 구현 | `feat/7-parse-html` |
| `fix` | 버그 수정 | `fix/12-diff-text-node` |
| `refactor` | 리팩토링 | `refactor/15-history-cleanup` |
| `docs` | 문서 수정 | `docs/3-update-readme` |

```bash
git switch -c feat/7-parse-html
```

### 9.3 커밋 메시지 규칙

형식: `{타입}: {설명} #{이슈번호}`

```
feat: parseHTML 함수 구현 #7
fix: 텍스트 노드 diff 오류 수정 #12
refactor: createHistory 듀얼 스택 분리 #15
```

- 이슈 번호를 포함하면 GitHub에서 커밋 ↔ 이슈가 자동으로 연결됩니다.
- 한 커밋은 한 가지 변경만 담습니다. 여러 기능을 한 커밋에 묶지 마세요.

### 9.4 작업 완료 후 — 이슈 코멘트 + PR

작업이 끝나면 **PR 생성 전** 다음을 먼저 합니다:

1. 해당 이슈에 **테스트 결과 코멘트** 작성:
   ```
   ## 테스트 결과
   - [ ] parseHTML('<div>hello</div>') → VNode 정상 반환 확인
   - [ ] 중첩 태그 파싱 확인
   - [ ] 빈 문자열 입력 시 예외 처리 확인

   ## 확인된 동작
   (스크린샷 또는 console.log 결과 붙여넣기)
   ```

2. `main` 브랜치로 **PR(Pull Request) 생성**:
   - 제목: 커밋 메시지와 동일한 형식
   - 본문에 `Closes #7` 또는 `Fixes #7` 포함 → PR 머지 시 이슈 자동 close
   - 다른 팀원 최소 1명 리뷰 요청

3. PR 머지 후 이슈가 자동으로 닫힙니다.

### 9.5 버그 발생 시 워크플로우

최종 통합 테스트 또는 리뷰 중 버그가 발견된 경우:

1. GitHub에 **새 Issue 생성**, `bug` 라벨 추가
   - 제목: `[bug] 증상 설명` (예: `[bug] 자식 노드 2개 이상일 때 diff 누락`)
   - 본문: 재현 절차, 예상 동작, 실제 동작

2. `fix/{이슈번호}-{설명}` 브랜치 생성 후 수정:
   ```bash
   git switch -c fix/20-diff-missing-children
   ```

3. 수정 완료 후 해당 이슈에 코멘트 작성:
   ```
   ## 원인
   diff()에서 children 순회 시 maxLen 계산 오류

   ## 수정 내용
   Math.max(oldNode.children.length, newNode.children.length) 로 변경

   ## 테스트 결과
   - [ ] 자식 3개 → 5개로 늘었을 때 CREATE 패치 정상 생성 확인
   - [ ] 자식 5개 → 2개로 줄었을 때 DELETE 패치 정상 생성 확인
   ```

4. PR 생성 (`Fixes #20` 포함) → 리뷰 → 머지 → 이슈 자동 close

### 9.6 전체 흐름 요약

```
이슈 생성 (#N)
  └─→ 브랜치 생성 (feat/N-xxx 또는 fix/N-xxx)
        └─→ 작업 + 커밋 (메시지에 #N 포함)
              └─→ 이슈에 테스트 결과 코멘트
                    └─→ PR 생성 (Closes #N 또는 Fixes #N)
                          └─→ 코드 리뷰
                                └─→ main 머지 → 이슈 자동 close
```

---

## 10. 통합 흐름 요약

```
[페이지 로드]
  realArea (DOM) ──domToVNode()──→ initialVNode
  initialVNode ──history.push()──→ backStack
  initialVNode ──render()──→ realArea 초기 렌더
  realArea.innerHTML ──→ testTextarea.value

[Patch 버튼 클릭]
  testTextarea.value
    ──parseHTML()──→ newVNode
    ──diff(oldVNode, newVNode)──→ patches[]
    ──applyPatches(realArea, patches)──→ 실제 DOM 최소 업데이트
    ──history.push(newVNode)──→ 히스토리 저장

[뒤로가기 버튼 클릭]
  history.back() ──→ prevVNode
  prevVNode ──render()──→ realArea 재렌더
  realArea.innerHTML ──→ testTextarea.value 동기화

[앞으로가기 버튼 클릭]
  history.forward() ──→ nextVNode
  nextVNode ──render()──→ realArea 재렌더
  realArea.innerHTML ──→ testTextarea.value 동기화
```
