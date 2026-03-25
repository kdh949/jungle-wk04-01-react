/**
 * @typedef {Object} VNode
 * @property {string} type
 * @property {Object.<string, string>} props
 * @property {Array.<VNode|string>} children
 * @property {string} [key]
 */

/**
 * @typedef {'CREATE' | 'DELETE' | 'REPLACE' | 'UPDATE_PROPS' | 'TEXT'} PatchType
 */

/**
 * @typedef {Object} Patch
 * @property {PatchType} type
 * @property {number[]} path
 * @property {VNode} [newNode]
 * @property {Object.<string, string|null>} [propsDiff]
 * @property {string} [text]
 */

/**
 * 두 props 객체를 비교하여 변경된 속성 맵을 반환합니다.
 *
 * @param {Object.<string, string>} oldProps
 * @param {Object.<string, string>} newProps
 * @returns {Object.<string, string|null>}
 */
export function diffProps(oldProps = {}, newProps = {}) {
  const propsDiff = {};

  Object.keys(newProps).forEach((key) => {
    if (oldProps[key] !== newProps[key]) {
      propsDiff[key] = newProps[key];
    }
  });

  Object.keys(oldProps).forEach((key) => {
    if (!(key in newProps)) {
      propsDiff[key] = null;
    }
  });

  return propsDiff;
}

/**
 * 두 VNode 트리를 비교하여 변경 사항(Patch) 목록을 반환합니다.
 *
 * @param {VNode|string|null} oldNode
 * @param {VNode|string|null} newNode
 * @param {number[]} [path=[]]
 * @returns {Patch[]}
 */
export function diff(oldNode, newNode, path = []) {
  const patches = [];

  if (oldNode == null && newNode == null) {
    return patches;
  }

  if (oldNode != null && newNode == null) {
    patches.push({ type: 'DELETE', path });
    return patches;
  }

  if (oldNode == null && newNode != null) {
    patches.push({ type: 'CREATE', path, newNode });
    return patches;
  }

  const oldIsTextNode = typeof oldNode === 'string';
  const newIsTextNode = typeof newNode === 'string';

  if (oldIsTextNode && newIsTextNode) {
    if (oldNode !== newNode) {
      patches.push({ type: 'TEXT', path, text: newNode });
    }

    return patches;
  }

  if (oldIsTextNode || newIsTextNode) {
    patches.push({ type: 'REPLACE', path, newNode });
    return patches;
  }

  if (oldNode.type !== newNode.type) {
    patches.push({ type: 'REPLACE', path, newNode });
    return patches;
  }

  const propsDiff = diffProps(oldNode.props, newNode.props);

  if (Object.keys(propsDiff).length > 0) {
    patches.push({ type: 'UPDATE_PROPS', path, propsDiff });
  }

  const maxChildrenLength = Math.max(
    oldNode.children.length,
    newNode.children.length,
  );

  for (let index = 0; index < maxChildrenLength; index += 1) {
    patches.push(
      ...diff(
        oldNode.children[index] ?? null,
        newNode.children[index] ?? null,
        [...path, index],
      ),
    );
  }

  return patches;
}
