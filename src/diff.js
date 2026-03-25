/**
 * @typedef {Object} VNode
 * @property {string} type
 * @property {Object.<string, string>} props
 * @property {Array.<VNode|string>} children
 * @property {string} [key]
 */

/**
 * @typedef {'CREATE' | 'DELETE' | 'MOVE' | 'REPLACE' | 'UPDATE_PROPS' | 'TEXT'} PatchType
 */

/**
 * @typedef {Object} Patch
 * @property {PatchType} type
 * @property {number[]} path
 * @property {number[]} [from]
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

  // 새 props에 있는 값이 달라졌다면 추가/변경으로 기록합니다.
  Object.keys(newProps).forEach((key) => {
    if (oldProps[key] !== newProps[key]) {
      propsDiff[key] = newProps[key];
    }
  });

  // 이전에는 있었지만 새 props에는 없는 값은 null로 표시해 제거를 의미합니다.
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
  const moveAndCreatePatches = [];
  const updatePatches = [];

  // key가 있으면 "같은 위치"보다 "같은 아이템"인지 먼저 찾습니다.
  // 그래서 reorder나 중간 삽입도 MOVE로 표현할 수 있습니다.
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

  // 삭제는 뒤에서부터 만들어야 앞 인덱스가 밀리지 않습니다.
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

  // DELETE를 적용한 뒤 자식 목록이 어떻게 보일지 시뮬레이션해서
  // 이동과 생성을 새 인덱스 기준으로 계산합니다.
  const simulatedChildren = oldChildren.filter((child) => {
    if (!child || typeof child === 'string' || child.key == null) {
      return true;
    }

    return newKeySet.has(child.key);
  });

  const moveChild = (fromIndex, toIndex) => {
    const [movedChild] = simulatedChildren.splice(fromIndex, 1);
    simulatedChildren.splice(toIndex, 0, movedChild);
  };

  newChildren.forEach((newChild, i) => {
    const newKey =
      newChild && typeof newChild !== 'string' ? newChild.key : undefined;

    if (newKey != null) {
      const currentIndex = simulatedChildren.findIndex((child) => (
        child && typeof child !== 'string' && child.key === newKey
      ));

      if (currentIndex !== -1) {
        if (currentIndex !== i) {
          moveAndCreatePatches.push({
            type: 'MOVE',
            from: [...path, currentIndex],
            path: [...path, i],
          });
          moveChild(currentIndex, i);
        }

        // MOVE 이후의 새 인덱스 기준으로 내용을 재귀 비교합니다.
        updatePatches.push(...diff(simulatedChildren[i], newChild, [...path, i]));
      } else {
        // 새 key → CREATE
        moveAndCreatePatches.push({ type: 'CREATE', path: [...path, i], newNode: newChild });
        simulatedChildren.splice(i, 0, newChild);
      }
    } else {
      // key 없음 → index 기반 폴백
      updatePatches.push(
        ...diff(simulatedChildren[i] ?? null, newChild, [...path, i]),
      );
    }
  });

  // 실제 patch 적용 시에는 path가 인덱스 기반이라,
  // DELETE를 먼저 처리한 뒤 MOVE/CREATE, 마지막으로 내용을 갱신해야 참조가 어긋나지 않습니다.
  return [...deletionPatches, ...moveAndCreatePatches, ...updatePatches];
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

  // 공통 길이 구간은 같은 인덱스끼리 비교합니다.
  for (let index = 0; index < sharedLength; index += 1) {
    patches.push(
      ...diff(oldChildren[index], newChildren[index], [...path, index]),
    );
  }

  // 남는 old 자식은 삭제 대상입니다. 역시 뒤에서부터 지웁니다.
  for (let index = oldChildren.length - 1; index >= sharedLength; index -= 1) {
    patches.push({ type: 'DELETE', path: [...path, index] });
  }

  // 남는 new 자식은 새로 생성합니다.
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

  // 둘 다 없으면 바뀐 것이 없습니다.
  if (oldNode == null && newNode == null) {
    return patches;
  }

  // 이전에는 있었는데 새 트리에 없으면 삭제입니다.
  if (oldNode != null && newNode == null) {
    patches.push({ type: 'DELETE', path });
    return patches;
  }

  // 이전에는 없고 새 트리에만 있으면 생성입니다.
  if (oldNode == null && newNode != null) {
    patches.push({ type: 'CREATE', path, newNode });
    return patches;
  }

  const oldIsTextNode = typeof oldNode === 'string';
  const newIsTextNode = typeof newNode === 'string';

  // 텍스트 노드는 문자열끼리 바로 비교합니다.
  if (oldIsTextNode && newIsTextNode) {
    if (oldNode !== newNode) {
      patches.push({ type: 'TEXT', path, text: newNode });
    }

    return patches;
  }

  // 한쪽만 텍스트라면 구조 자체가 달라졌다고 보고 교체합니다.
  if (oldIsTextNode || newIsTextNode) {
    patches.push({ type: 'REPLACE', path, newNode });
    return patches;
  }

  // 태그 이름이 달라지면 자식 비교 대신 노드 전체 교체가 더 단순합니다.
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
