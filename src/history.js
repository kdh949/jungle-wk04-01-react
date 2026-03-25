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
      forwardStack.length = 0;
    },

    back() {
      if (backStack.length <= 1) {
        return null;
      }

      const previousCurrent = backStack.pop();
      forwardStack.push(previousCurrent);

      return current();
    },

    forward() {
      if (forwardStack.length === 0) {
        return null;
      }

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
