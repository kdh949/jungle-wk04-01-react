const isElementVNode = (node) => node != null && typeof node !== 'string';

const collectTextContent = (node) => {
  if (typeof node === 'string') {
    return node;
  }

  if (!isElementVNode(node)) {
    return '';
  }

  return (node.children ?? []).map((child) => collectTextContent(child)).join('');
};

const getPropsSignature = (props = {}) =>
  Object.entries(props)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');

const getElementSignature = (node) => {
  if (!isElementVNode(node)) {
    return '';
  }

  // key를 복원할 때 "이전 노드와 얼마나 비슷한지" 빠르게 판단하기 위한 서명입니다.
  const childElementTypes = (node.children ?? [])
    .filter((child) => isElementVNode(child))
    .map((child) => child.type)
    .join(',');

  return [
    node.type,
    getPropsSignature(node.props),
    collectTextContent(node),
    childElementTypes,
  ].join('::');
};

const cloneWithKey = (node, key, children) => ({
  type: node.type,
  props: { ...(node.props ?? {}) },
  children,
  key,
});

/**
 * VNode 트리에 내부 추적용 key를 부여합니다.
 *
 * @param {Object|string} vnode
 * @param {() => string} createKey
 * @returns {Object|string}
 */
export function assignInternalKeys(vnode, createKey) {
  if (!isElementVNode(vnode)) {
    return vnode;
  }

  // 사용자가 key를 보지 않아도 내부 diff는 key 기반으로 동작할 수 있게
  // 초기 트리에만 내부용 key를 채워 넣습니다.
  return cloneWithKey(
    vnode,
    vnode.key ?? createKey(),
    (vnode.children ?? []).map((child) => assignInternalKeys(child, createKey)),
  );
}

const reconcileChildren = (oldChildren = [], newChildren = [], createKey) => {
  const matches = new Array(newChildren.length).fill(null);
  const usedOldIndices = new Set();
  const oldCandidates = oldChildren.map((child, index) => ({
    child,
    index,
    signature: getElementSignature(child),
  }));

  const findBestExactMatch = (newChild, newIndex) => {
    const newSignature = getElementSignature(newChild);

    // 가장 먼저 "내용까지 같은 노드"를 찾습니다.
    return oldCandidates
      .filter(({ child, index, signature }) =>
        !usedOldIndices.has(index) &&
        isElementVNode(child) &&
        child.type === newChild.type &&
        signature === newSignature)
      .sort((left, right) => Math.abs(left.index - newIndex) - Math.abs(right.index - newIndex))[0] ?? null;
  };

  const findSameTypeAtSameIndex = (newChild, newIndex) => {
    const oldChild = oldChildren[newIndex];

    // exact match가 없으면 같은 자리에 있던 같은 태그를 우선 재사용합니다.
    if (
      usedOldIndices.has(newIndex) ||
      !isElementVNode(oldChild) ||
      oldChild.type !== newChild.type
    ) {
      return null;
    }

    return { child: oldChild, index: newIndex };
  };

  const findNearestSameType = (newChild, newIndex) =>
    // 마지막 폴백은 가장 가까운 같은 태그입니다.
    oldCandidates
      .filter(({ child, index }) =>
        !usedOldIndices.has(index) &&
        isElementVNode(child) &&
        child.type === newChild.type)
      .sort((left, right) => Math.abs(left.index - newIndex) - Math.abs(right.index - newIndex))[0] ?? null;

  newChildren.forEach((newChild, newIndex) => {
    if (!isElementVNode(newChild)) {
      return;
    }

    // 1차: 내용까지 같은 노드 매칭
    const exactMatch = findBestExactMatch(newChild, newIndex);

    if (exactMatch) {
      matches[newIndex] = exactMatch.index;
      usedOldIndices.add(exactMatch.index);
    }
  });

  newChildren.forEach((newChild, newIndex) => {
    if (!isElementVNode(newChild) || matches[newIndex] != null) {
      return;
    }

    // 2차: 같은 위치, 같은 태그 매칭
    const sameIndexMatch = findSameTypeAtSameIndex(newChild, newIndex);

    if (sameIndexMatch) {
      matches[newIndex] = sameIndexMatch.index;
      usedOldIndices.add(sameIndexMatch.index);
    }
  });

  newChildren.forEach((newChild, newIndex) => {
    if (!isElementVNode(newChild) || matches[newIndex] != null) {
      return;
    }

    // 3차: 가장 가까운 같은 태그 매칭
    const nearestMatch = findNearestSameType(newChild, newIndex);

    if (nearestMatch) {
      matches[newIndex] = nearestMatch.index;
      usedOldIndices.add(nearestMatch.index);
    }
  });

  return newChildren.map((newChild, newIndex) => {
    if (!isElementVNode(newChild)) {
      return newChild;
    }

    const matchedOldIndex = matches[newIndex];

    if (matchedOldIndex == null) {
      // 새로 생긴 노드는 새 내부 key를 발급합니다.
      return assignInternalKeys(newChild, createKey);
    }

    // 기존 노드로 판단되면 그 key를 이어받고 자식도 재귀적으로 복원합니다.
    return reconcileInternalKeys(oldChildren[matchedOldIndex], newChild, createKey);
  });
};

/**
 * 편집 결과로 만든 keyless VNode에 이전 keyed VNode의 key를 다시 매핑합니다.
 *
 * @param {Object|string|null} previousVNode
 * @param {Object|string|null} nextVNode
 * @param {() => string} createKey
 * @returns {Object|string|null}
 */
export function reconcileInternalKeys(previousVNode, nextVNode, createKey) {
  if (nextVNode == null || typeof nextVNode === 'string') {
    return nextVNode;
  }

  if (
    !isElementVNode(previousVNode) ||
    previousVNode.type !== nextVNode.type
  ) {
    // 루트 태그부터 달라졌다면 이전 key를 이어붙일 근거가 없어서 새로 부여합니다.
    return assignInternalKeys(nextVNode, createKey);
  }

  return cloneWithKey(
    nextVNode,
    previousVNode.key ?? nextVNode.key ?? createKey(),
    reconcileChildren(previousVNode.children ?? [], nextVNode.children ?? [], createKey),
  );
}
