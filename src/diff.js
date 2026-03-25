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
 * 자식 배열 중 key를 가진 노드가 하나라도 있는지 확인합니다.
 *
 * @param {Array.<VNode|string>} children
 * @returns {boolean}
 */
function hasAnyKey(children) {
  return children.some(
    (child) => child && typeof child !== 'string' && child.key != null,
  );
}

/**
 * key 기반으로 자식 노드 목록을 비교합니다.
 *
 * 동작 순서:
 *   1. old에만 있는 key → DELETE (인덱스 역순으로 생성 → 앞 패치 적용 후에도 인덱스 불변)
 *   2. new 목록 순서대로 매칭:
 *      - key가 old에 있으면 내용 재귀 diff
 *      - key가 old에 없으면 CREATE
 *      - key 없는 자식은 index 기반 폴백
 *
 * @param {Array.<VNode|string>} oldChildren
 * @param {Array.<VNode|string>} newChildren
 * @param {number[]} path - 부모 노드까지의 경로
 * @returns {Patch[]}
 */
function diffKeyedChildren(oldChildren, newChildren, path) {
  const deletionPatches = [];
  const updatePatches = [];

  // old keyed 노드 맵: key → { vnode, index }
  const oldKeyedMap = new Map();
  oldChildren.forEach((child, i) => {
    if (child && typeof child !== 'string' && child.key != null) {
      oldKeyedMap.set(child.key, { vnode: child, index: i });
    }
  });

  // new key 집합
  const newKeySet = new Set(
    newChildren
      .filter((child) => child && typeof child !== 'string' && child.key != null)
      .map((child) => child.key),
  );

  // Phase 1: new에 없는 old keyed 노드 → DELETE (역순으로 생성)
  const indicesToDelete = [];
  oldKeyedMap.forEach(({ index }, key) => {
    if (!newKeySet.has(key)) {
      indicesToDelete.push(index);
    }
  });
  indicesToDelete
    .sort((a, b) => b - a)
    .forEach((i) => {
      deletionPatches.push({ type: 'DELETE', path: [...path, i] });
    });

  // Phase 2: new 자식 각각에 대해 old와 매칭 후 diff
  newChildren.forEach((newChild, i) => {
    const newKey =
      newChild && typeof newChild !== 'string' ? newChild.key : undefined;

    if (newKey != null) {
      const oldEntry = oldKeyedMap.get(newKey);
      if (oldEntry) {
        // 동일 key 존재 → 내용 재귀 비교 (new 인덱스 기준 경로 사용)
        updatePatches.push(...diff(oldEntry.vnode, newChild, [...path, i]));
      } else {
        // 새 key → CREATE
        updatePatches.push({ type: 'CREATE', path: [...path, i], newNode: newChild });
      }
    } else {
      // key 없음 → index 기반 폴백
      updatePatches.push(
        ...diff(oldChildren[i] ?? null, newChild, [...path, i]),
      );
    }
  });

  // DELETE를 먼저 적용해야 이후 index 기반 패치가 올바른 노드를 참조함
  return [...deletionPatches, ...updatePatches];
}

/**
 * key가 없는 자식 노드 목록을 index 기반으로 비교합니다.
 *
 * 공통 구간은 앞에서부터 재귀 비교하고,
 * 삭제가 필요한 자식은 뒤에서부터 DELETE 패치를 만들어 인덱스 밀림을 방지합니다.
 *
 * @param {Array.<VNode|string>} oldChildren
 * @param {Array.<VNode|string>} newChildren
 * @param {number[]} path
 * @returns {Patch[]}
 */
function diffUnkeyedChildren(oldChildren, newChildren, path) {
  const patches = [];
  const sharedLength = Math.min(oldChildren.length, newChildren.length);

  for (let index = 0; index < sharedLength; index += 1) {
    patches.push(
      ...diff(oldChildren[index], newChildren[index], [...path, index]),
    );
  }

  for (let index = oldChildren.length - 1; index >= sharedLength; index -= 1) {
    patches.push({ type: 'DELETE', path: [...path, index] });
  }

  for (let index = sharedLength; index < newChildren.length; index += 1) {
    patches.push({
      type: 'CREATE',
      path: [...path, index],
      newNode: newChildren[index],
    });
  }

  return patches;
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

  // key를 가진 자식이 하나라도 있으면 key 기반 비교, 아니면 index 기반 비교
  if (hasAnyKey(oldNode.children) || hasAnyKey(newNode.children)) {
    patches.push(...diffKeyedChildren(oldNode.children, newNode.children, path));
  } else {
    patches.push(...diffUnkeyedChildren(oldNode.children, newNode.children, path));
  }

  return patches;
}
