# 프론트엔드 전면 재설계 — AI 바이브코딩 지침서

> **AI 에이전트에게:** 이 문서는 `feat/frontend-redesign` 베이스 브랜치에서 진행하는 UI 전면 재설계 작업의 단일 소스 오브 트루스입니다.
> 반드시 전체를 읽고 **수정 금지 범위**를 확인한 뒤 작업하세요.

---

## 1. 작업 목표

`index.html`과 `style.css`를 전면 재설계합니다.
핵심 비즈니스 로직(`src/*.js`)은 **완성·검증된 상태**이므로 건드리지 않습니다.

---

## 2. 수정 가능 파일 vs 수정 금지 파일

### 수정 가능 ✅

| 파일 | 자유도 |
|---|---|
| `index.html` | 레이아웃 구조·마크업 자유롭게 변경 가능. 단, 아래 **필수 보존 ID** 준수 |
| `style.css` | 완전 자유. 전부 갈아엎어도 됨 |

### 수정 금지 🚫

| 파일 | 이유 |
|---|---|
| `src/main.js` | UI 이벤트 바인딩. 아래 필수 ID에 의존 |
| `src/diff.js` | 핵심 diff 알고리즘 |
| `src/patch.js` | DOM 패치 로직 |
| `src/renderer.js` | VNode → DOM 렌더러 |
| `src/vdom.js` | HTML 파싱 + DOM → VNode |
| `src/history.js` | 히스토리 관리 |
| `tests/` | 테스트 파일 |

---

## 3. 필수 보존 HTML 요소 (절대 변경 불가)

`src/main.js`가 아래 ID로 DOM을 직접 참조합니다.
**ID를 바꾸거나 삭제하면 앱이 동작하지 않습니다.**

```html
<!-- 렌더링 결과가 표시되는 실제 영역 -->
<div id="real-area"> ... </div>

<!-- 사용자가 HTML을 편집하는 textarea -->
<textarea id="test-textarea"></textarea>

<!-- 세 개의 컨트롤 버튼 -->
<button id="btn-back">...</button>
<button id="btn-patch">...</button>
<button id="btn-forward">...</button>
```

> `<script type="module" src="./src/main.js"></script>` 태그도 반드시 유지하세요.

---

## 4. 앱 동작 흐름 (UI 설계 참고용)

```
페이지 로드
  └─ 실제 영역(#real-area)의 초기 DOM → VNode 변환 → 렌더링
  └─ 동일 내용 → #test-textarea에 HTML 문자열로 표시

#test-textarea에서 HTML 자유 편집
  └─ [Patch #btn-patch] 클릭
       └─ textarea 내용을 VNode로 변환
       └─ 이전 VNode와 diff 비교 → 변경된 부분만 #real-area에 반영
       └─ 현재 상태 히스토리에 저장

[Back #btn-back] / [Forward #btn-forward]
  └─ 히스토리 스택에서 이전/다음 VNode 꺼내어 #real-area + #test-textarea 동기화
```

### 버튼 활성/비활성 상태
- `#btn-back`: 이전 히스토리 없을 때 `disabled`
- `#btn-forward`: 다음 히스토리 없을 때 `disabled`
- `#btn-patch`: 항상 활성 (초기화 실패 시에만 `disabled`)

---

## 5. 현재 UI 구조 (재설계 전 참고용)

```
┌──────────────────────────────────────────────────────┐
│  mini-react  (헤더)                                  │
├────────────────────┬─────────────────────────────────┤
│  Real Area (좌측)  │  Test Area (우측)                │
│  #real-area        │  <textarea #test-textarea>      │
│                    │                                 │
│  렌더링 결과 표시   │  HTML 직접 편집                  │
├────────────────────┴─────────────────────────────────┤
│  [Back]          [Patch]          [Forward]          │
│  #btn-back       #btn-patch       #btn-forward       │
└──────────────────────────────────────────────────────┘
```

현재 스타일 키워드: 베이지/크림 계열, 둥근 카드, 소프트 그림자.

---

## 6. 설계 자유도

아래 항목은 **완전히 자유**입니다.

- 전체 레이아웃 (그리드, 플렉스, 사이드바, 탭 등)
- 컬러 팔레트 (다크모드 포함)
- 타이포그래피 (웹폰트 추가 가능)
- 애니메이션 / 트랜지션
- 패널 구성 방식 (좌우 분할, 상하 분할, 오버레이 등)
- 버튼 위치 및 디자인
- 추가 UI 요소 (툴바, 상태바, 아이콘 등)

---

## 7. 브랜치 전략

### 전체 구조
```
main
└── feat/frontend-redesign          ← 베이스 브랜치 (이 문서가 있는 곳)
    ├── feat/frontend-redesign/범진  ← 범진 프로토타입
    ├── feat/frontend-redesign/동현  ← 동현 프로토타입
    └── feat/frontend-redesign/정연  ← 정연 프로토타입
```

### 작업 시작 방법

```bash
# feat/frontend-redesign 베이스에서 본인 브랜치 생성
git fetch origin
git switch feat/frontend-redesign
git switch -c feat/frontend-redesign/[본인이름]
```

### 작업 완료 후 푸시

```bash
git add index.html style.css
git commit -m "feat: [본인이름] 프론트엔드 프로토타입"
git push origin feat/frontend-redesign/[본인이름]
```

### 최종 선택 및 머지

1. 각자 본인 브랜치를 `feat/frontend-redesign`으로 PR 생성
2. 팀이 프로토타입 비교 후 하나를 선택
3. 선택된 PR만 `feat/frontend-redesign`에 머지
4. 나머지 PR 닫기
5. `feat/frontend-redesign` → `main` 최종 머지

---

## 8. 체크리스트 (PR 전 자가 검증)

```
[ ] index.html에 id="real-area" 존재
[ ] index.html에 id="test-textarea" 존재
[ ] index.html에 id="btn-back" 존재
[ ] index.html에 id="btn-patch" 존재
[ ] index.html에 id="btn-forward" 존재
[ ] <script type="module" src="./src/main.js"> 존재
[ ] 초기 렌더링 정상 동작 (페이지 로드 시 실제 영역에 샘플 HTML 표시)
[ ] Patch 버튼 클릭 시 실제 영역 변경 확인
[ ] Back / Forward 버튼 동작 확인
[ ] 모바일(또는 좁은 뷰포트)에서 레이아웃 깨지지 않음
```
