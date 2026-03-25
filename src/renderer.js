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

/**
 * VNode를 사람이 읽기 쉬운 HTML 문자열로 직렬화합니다.
 *
 * @param {Object|string} vnode
 * @param {number} [depth=0]
 * @returns {string}
 */
export function vnodeToHTML(vnode, depth = 0) {
  if (typeof vnode === 'string') {
    return `${'  '.repeat(depth)}${escapeHTML(vnode)}`;
  }

  const indent = '  '.repeat(depth);
  const props = { ...(vnode.props ?? {}) };

  if (vnode.key != null) {
    props.key = vnode.key;
  }

  const attributes = Object.entries(props)
    .map(([key, value]) => ` ${key}="${escapeHTML(value)}"`)
    .join('');

  if (!vnode.children || vnode.children.length === 0) {
    return `${indent}<${vnode.type}${attributes}></${vnode.type}>`;
  }

  const onlyTextChildren = vnode.children.every((child) => typeof child === 'string');

  if (onlyTextChildren) {
    const textContent = vnode.children.map((child) => escapeHTML(child)).join('');
    return `${indent}<${vnode.type}${attributes}>${textContent}</${vnode.type}>`;
  }

  const childrenHTML = vnode.children
    .map((child) => vnodeToHTML(child, depth + 1))
    .join('\n');

  return `${indent}<${vnode.type}${attributes}>\n${childrenHTML}\n${indent}</${vnode.type}>`;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
