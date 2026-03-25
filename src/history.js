/**
 * 듀얼 스택 기반 히스토리 관리자를 생성합니다.
 *
 * @returns {{
 *   push: (vnode: object) => void,
 *   back: () => object|null,
 *   forward: () => object|null,
 *   current: () => object|null,
 *   canBack: () => boolean,
 *   canForward: () => boolean
 * }}
 */
export function createHistory() {
  // backStack의 마지막 원소가 항상 "현재 화면 상태"입니다.
  const backStack = [];
  const forwardStack = [];

  const current = () => {
    if (backStack.length === 0) {
      return null;
    }

    return backStack[backStack.length - 1];
  };

  return {
    push(vnode) {
      backStack.push(vnode);
      // 새 편집이 들어오면 이전 redo 기록은 더 이상 의미가 없으므로 비웁니다.
      forwardStack.length = 0;
    },

    back() {
      if (backStack.length <= 1) {
        return null;
      }

      // 현재 상태를 앞으로가기 스택으로 옮기고,
      // pop 후 남아 있는 맨 위 상태를 반환합니다.
      const previousCurrent = backStack.pop();
      forwardStack.push(previousCurrent);

      return current();
    },

    forward() {
      if (forwardStack.length === 0) {
        return null;
      }

      // redo는 forwardStack에서 꺼내 backStack 끝에 다시 쌓는 방식입니다.
      const nextCurrent = forwardStack.pop();
      backStack.push(nextCurrent);

      return current();
    },

    current,

    canBack() {
      return backStack.length > 1;
    },

    canForward() {
      return forwardStack.length > 0;
    },
  };
}
