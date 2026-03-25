/**
 * VNode를 실제 DOM Element로 변환합니다 (초기 렌더링용).
 *
 * @param {Object|string} vnode
 * @param {{ includeKeyAttribute?: boolean }} [options]
 * @returns {Element|Text}
 */
export function render(vnode, options = {}) {
  const { includeKeyAttribute = false } = options;

  if (typeof vnode === 'string') {
    return document.createTextNode(vnode);
  }

  const element = document.createElement(vnode.type);

  Object.entries(vnode.props ?? {}).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  // 내부 key는 기본적으로 DOM에 노출하지 않고, 필요한 경우에만 옵션으로 붙입니다.
  if (includeKeyAttribute && vnode.key != null) {
    element.setAttribute('key', vnode.key);
  }

  (vnode.children ?? []).forEach((child) => {
    element.appendChild(render(child, options));
  });

  return element;
}

/**
 * VNode를 사람이 읽기 쉬운 HTML 문자열로 직렬화합니다.
 *
 * @param {Object|string} vnode
 * @param {number} [depth=0]
 * @param {boolean} [compact=false]
 * @returns {string}
 */
export function vnodeToHTML(vnode, depth = 0, compact = false) {
  if (typeof vnode === 'string') {
    return compact ? escapeHTML(vnode) : `${'  '.repeat(depth)}${escapeHTML(vnode)}`;
  }

  const indent = compact ? '' : '  '.repeat(depth);
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
  const hasTextChild = vnode.children.some((child) => typeof child === 'string');
  const canInlineMixedChildren = vnode.children.every((child) => {
    if (typeof child === 'string') {
      return true;
    }

    return isInlineTag(child.type);
  });

  if (onlyTextChildren) {
    const textContent = vnode.children.map((child) => escapeHTML(child)).join('');
    return `${indent}<${vnode.type}${attributes}>${textContent}</${vnode.type}>`;
  }

  // 텍스트와 inline 태그가 섞인 구간은 한 줄로 직렬화해야
  // 다시 parseHTML 할 때 불필요한 공백 텍스트 노드가 늘어나지 않습니다.
  if (compact || (hasTextChild && canInlineMixedChildren)) {
    const childrenHTML = vnode.children
      .map((child) => vnodeToHTML(child, 0, true))
      .join('');

    return `${indent}<${vnode.type}${attributes}>${childrenHTML}</${vnode.type}>`;
  }

  const childrenHTML = vnode.children
    .map((child) => vnodeToHTML(child, depth + 1, false))
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

function isInlineTag(tagName) {
  // 줄바꿈 없이 한 줄로 붙여도 자연스러운 HTML 태그 목록입니다.
  return new Set([
    'a',
    'abbr',
    'b',
    'bdi',
    'bdo',
    'br',
    'cite',
    'code',
    'data',
    'dfn',
    'em',
    'i',
    'img',
    'kbd',
    'label',
    'mark',
    'q',
    's',
    'samp',
    'small',
    'span',
    'strong',
    'sub',
    'sup',
    'time',
    'u',
    'var',
    'wbr',
  ]).has(tagName);
}
