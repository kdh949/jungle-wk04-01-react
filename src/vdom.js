/**
 * @typedef {Object} VNode
 * @property {string} type
 * @property {Object.<string, string>} props
 * @property {Array.<VNode|string>} children
 * @property {string} [key]
 */

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/**
 * HTML 문자열을 파싱하여 VNode 트리를 반환합니다.
 *
 * @param {string} htmlString
 * @returns {VNode}
 */
export function parseHTML(htmlString) {
  if (typeof DOMParser === 'undefined') {
    throw new Error('parseHTML requires DOMParser in a browser environment.');
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(htmlString, 'text/html');
  const childVNodes = Array.from(document.body.childNodes)
    .map((node) => domToVNode(node))
    .filter((node) => node !== null);

  if (childVNodes.length === 1 && typeof childVNodes[0] !== 'string') {
    return childVNodes[0];
  }

  return createVNode('div', {}, childVNodes);
}

/**
 * 실제 DOM Element를 VNode로 변환합니다.
 *
 * @param {Element|Text} element
 * @returns {VNode|string|null}
 */
export function domToVNode(element) {
  if (element.nodeType === TEXT_NODE) {
    return normalizeTextNode(element);
  }

  if (element.nodeType !== ELEMENT_NODE) {
    return null;
  }

  const props = {};
  let key;

  Array.from(element.attributes).forEach((attribute) => {
    if (attribute.name === 'key') {
      key = attribute.value;
      return;
    }

    props[attribute.name] = attribute.value;
  });

  const children = Array.from(element.childNodes)
    .map((childNode) => domToVNode(childNode))
    .filter((childNode) => childNode !== null);

  return createVNode(element.tagName.toLowerCase(), props, children, key);
}

/**
 * 공통 VNode 생성기입니다.
 *
 * @param {string} type
 * @param {Object.<string, string>} props
 * @param {Array.<VNode|string>} children
 * @param {string} [key]
 * @returns {VNode}
 */
function createVNode(type, props, children, key) {
  return {
    type,
    props,
    children,
    key,
  };
}

/**
 * 줄바꿈/들여쓰기처럼 의미 없는 공백 텍스트는 제외합니다.
 *
 * @param {Text} textNode
 * @returns {string|null}
 */
function normalizeTextNode(textNode) {
  const value = textNode.textContent ?? '';

  if (value.trim() === '') {
    return null;
  }

  return value;
}
