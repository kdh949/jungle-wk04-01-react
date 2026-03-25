/**
 * VNode를 실제 DOM Element로 변환합니다 (초기 렌더링용).
 *
 * @param {Object|string} vnode
 * @returns {Element|Text}
 */
export function render(vnode) {
  if (typeof vnode === 'string') {
    return document.createTextNode(vnode);
  }

  const element = document.createElement(vnode.type);

  Object.entries(vnode.props ?? {}).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  if (vnode.key != null) {
    element.setAttribute('key', vnode.key);
  }

  (vnode.children ?? []).forEach((child) => {
    element.appendChild(render(child));
  });

  return element;
}
