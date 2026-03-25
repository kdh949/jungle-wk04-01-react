import { render } from './renderer.js';

/**
 * path 배열을 따라 rootEl 하위에서 실제 DOM 노드를 찾아 반환합니다.
 *
 * @param {Element} rootEl
 * @param {number[]} path
 * @returns {Node|null}
 */
export function getNodeByPath(rootEl, path) {
  let currentNode = rootEl.firstChild ?? null;

  // 루트 path([])는 real area 안의 첫 번째 실제 렌더 노드를 의미합니다.
  if (path.length === 0) {
    return currentNode;
  }

  for (const index of path) {
    if (!currentNode?.childNodes?.[index]) {
      return null;
    }

    currentNode = currentNode.childNodes[index];
  }

  return currentNode;
}

const getParentByPath = (rootEl, path) => {
  if (path.length === 0) {
    return rootEl;
  }

  // 부모는 마지막 인덱스를 제외한 경로를 따라가면 찾을 수 있습니다.
  return getNodeByPath(rootEl, path.slice(0, -1));
};

const updateProps = (element, propsDiff) => {
  Object.entries(propsDiff).forEach(([key, value]) => {
    if (value === null) {
      element.removeAttribute(key);
      return;
    }

    element.setAttribute(key, value);
  });
};

/**
 * Patch 목록을 받아 루트 DOM 요소에 최소한의 조작으로 반영합니다.
 *
 * @param {Element} rootEl
 * @param {Array} patches
 * @returns {void}
 */
export function applyPatches(rootEl, patches) {
  // diff 단계에서 path 순서를 맞춰놨기 때문에 여기서는 순서대로 적용합니다.
  patches.forEach((patch) => {
    const targetNode = getNodeByPath(rootEl, patch.path);
    const parentNode = getParentByPath(rootEl, patch.path);
    const childIndex = patch.path[patch.path.length - 1];

    switch (patch.type) {
      case 'CREATE': {
        if (!(parentNode instanceof Element || parentNode instanceof DocumentFragment)) {
          return;
        }

        const newNode = render(patch.newNode);
        // 기준 노드 앞에 insertBefore를 쓰면 "중간 삽입"과 "맨 끝 추가"를 모두 처리할 수 있습니다.
        const referenceNode =
          patch.path.length === 0
            ? rootEl.firstChild
            : parentNode.childNodes[childIndex] ?? null;

        parentNode.insertBefore(newNode, referenceNode);
        break;
      }

      case 'DELETE':
        targetNode?.parentNode?.removeChild(targetNode);
        break;

      case 'MOVE': {
        if (!(parentNode instanceof Element || parentNode instanceof DocumentFragment)) {
          return;
        }

        const fromPath = patch.from ?? [];
        const sourceParentNode = getParentByPath(rootEl, fromPath);
        const sourceIndex = fromPath[fromPath.length - 1];

        if (!(sourceParentNode instanceof Element || sourceParentNode instanceof DocumentFragment)) {
          return;
        }

        const movingNode = sourceParentNode.childNodes[sourceIndex] ?? null;

        if (!movingNode || sourceParentNode !== parentNode) {
          return;
        }

        const referenceNode =
          sourceIndex < childIndex
            ? parentNode.childNodes[childIndex + 1] ?? null
            : parentNode.childNodes[childIndex] ?? null;

        parentNode.insertBefore(movingNode, referenceNode);
        break;
      }

      case 'REPLACE': {
        if (!targetNode?.parentNode) {
          return;
        }

        targetNode.parentNode.replaceChild(render(patch.newNode), targetNode);
        break;
      }

      case 'UPDATE_PROPS':
        if (targetNode instanceof Element) {
          updateProps(targetNode, patch.propsDiff ?? {});
        }
        break;

      case 'TEXT':
        if (targetNode instanceof Text) {
          targetNode.textContent = patch.text ?? '';
          return;
        }

        // 기대한 Text 노드가 아니라 Element를 잡은 경우에도
        // 최소한 사용자가 본 내용은 맞도록 textContent로 덮어씁니다.
        if (targetNode instanceof Element) {
          targetNode.textContent = patch.text ?? '';
        }
        break;

      default:
        break;
    }
  });
}
