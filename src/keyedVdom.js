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
      return assignInternalKeys(newChild, createKey);
    }

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
    return assignInternalKeys(nextVNode, createKey);
  }

  return cloneWithKey(
    nextVNode,
    previousVNode.key ?? nextVNode.key ?? createKey(),
    reconcileChildren(previousVNode.children ?? [], nextVNode.children ?? [], createKey),
  );
}
