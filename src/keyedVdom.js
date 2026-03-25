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

const countElementSignatures = (children = []) => {
  const counts = new Map();

  children.forEach((child) => {
    if (!isElementVNode(child)) {
      return;
    }

    const signature = getElementSignature(child);
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  });

  return counts;
};

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
  const oldSignatureCounts = countElementSignatures(oldChildren);
  const newSignatureCounts = countElementSignatures(newChildren);

  const findSameSignatureAtSameIndex = (newChild, newIndex) => {
    const oldChild = oldChildren[newIndex];

    if (
      usedOldIndices.has(newIndex) ||
      !isElementVNode(oldChild) ||
      getElementSignature(oldChild) !== getElementSignature(newChild)
    ) {
      return null;
    }

    return { child: oldChild, index: newIndex };
  };

  const findUniqueExactMatch = (newChild) => {
    const newSignature = getElementSignature(newChild);

    // 내용이 고유할 때만 위치를 넘어 exact match 시키면,
    // reorder는 살리고 duplicate 텍스트 편집에서 key가 서로 뒤바뀌는 문제를 막을 수 있습니다.
    if (
      (oldSignatureCounts.get(newSignature) ?? 0) !== 1 ||
      (newSignatureCounts.get(newSignature) ?? 0) !== 1
    ) {
      return null;
    }

    return oldCandidates
      .filter(({ child, index, signature }) =>
        !usedOldIndices.has(index) &&
        isElementVNode(child) &&
        signature === newSignature)
      [0] ?? null;
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

    // 1차: 같은 위치에서 내용까지 그대로인 노드를 먼저 고정합니다.
    const sameIndexExactMatch = findSameSignatureAtSameIndex(newChild, newIndex);

    if (sameIndexExactMatch) {
      matches[newIndex] = sameIndexExactMatch.index;
      usedOldIndices.add(sameIndexExactMatch.index);
    }
  });

  newChildren.forEach((newChild, newIndex) => {
    if (!isElementVNode(newChild) || matches[newIndex] != null) {
      return;
    }

    // 2차: 내용이 고유한 경우에만 위치를 넘어 exact match 시켜 reorder를 복원합니다.
    const uniqueExactMatch = findUniqueExactMatch(newChild);

    if (uniqueExactMatch) {
      matches[newIndex] = uniqueExactMatch.index;
      usedOldIndices.add(uniqueExactMatch.index);
    }
  });

  newChildren.forEach((newChild, newIndex) => {
    if (!isElementVNode(newChild) || matches[newIndex] != null) {
      return;
    }

    // 3차: 내용이 달라졌더라도 같은 위치의 같은 태그는 "편집된 기존 노드"일 가능성이 큽니다.
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

    // 4차: 마지막 폴백은 가장 가까운 같은 태그입니다.
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
