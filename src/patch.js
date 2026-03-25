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

        if (targetNode instanceof Element) {
          targetNode.textContent = patch.text ?? '';
        }
        break;

      default:
        break;
    }
  });
}
