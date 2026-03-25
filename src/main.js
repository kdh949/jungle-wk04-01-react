import { applyPatches } from './patch.js';
import { assignInternalKeys, reconcileInternalKeys } from './keyedVdom.js';
import { render } from './renderer.js';

const editorSurfaceEl = document.getElementById('editor-surface');
const previewAreaEl = document.getElementById('preview-area');
const backBtnEl = document.getElementById('btn-back');
const patchBtnEl = document.getElementById('btn-patch');
const forwardBtnEl = document.getElementById('btn-forward');
const liveSyncToggleEl = document.getElementById('live-sync-toggle');
const syncStateEl = document.getElementById('sync-state');
const patchSummaryEl = document.getElementById('patch-summary');
const patchListEl = document.getElementById('patch-list');

let diff;
let createHistory;
let parseHTML;
let history;

let syncTimerId = null;
let isProgrammaticEditorUpdate = false;
let editorObserver = null;
let isLiveSyncEnabled = true;
let hasPendingChanges = false;
let internalKeySeed = 0;

const setControlsDisabled = (disabled) => {
  backBtnEl.disabled = disabled;
  patchBtnEl.disabled = disabled;
  forwardBtnEl.disabled = disabled;
  liveSyncToggleEl.disabled = disabled;
};

const setSyncState = (label) => {
  syncStateEl.textContent = label;
};

const createInternalKey = () => {
  internalKeySeed += 1;
  return `node-${internalKeySeed}`;
};

const describeVNode = (vnode) => {
  if (typeof vnode === 'string') {
    return `"${vnode}"`;
  }

  if (vnode == null) {
    return 'null';
  }

  return `<${vnode.type}>`;
};

const getNodeAtPath = (vnode, path) => {
  let currentNode = vnode;

  for (const index of path) {
    if (typeof currentNode === 'string' || currentNode == null) {
      return null;
    }

    currentNode = currentNode.children?.[index] ?? null;
  }

  return currentNode;
};

const getPatchActionText = (patch) => {
  switch (patch.type) {
    case 'REPLACE':
      return `태그가 달라서 ${describeVNode(patch.newNode)} 로 전체 노드를 교체합니다.`;
    case 'TEXT':
      return `태그는 유지하고 내부 텍스트만 "${patch.text ?? ''}" 로 수정합니다.`;
    case 'CREATE':
      return `${describeVNode(patch.newNode)} 노드를 새로 추가합니다.`;
    case 'DELETE':
      return '해당 노드를 삭제합니다.';
    case 'UPDATE_PROPS':
      return '태그는 유지하고 속성만 수정합니다.';
    default:
      return '변경을 적용합니다.';
  }
};

const getPatchMetaText = (patch, oldVNode) => {
  const targetNode = getNodeAtPath(oldVNode, patch.path);
  const parentNode = getNodeAtPath(oldVNode, patch.path.slice(0, -1));
  const beforeTagNode =
    typeof targetNode === 'string' || targetNode == null ? parentNode : targetNode;
  const afterTagNode =
    patch.newNode && typeof patch.newNode !== 'string' ? patch.newNode : beforeTagNode;
  const beforeTag = describeVNode(beforeTagNode);
  const afterTag = describeVNode(afterTagNode);

  switch (patch.type) {
    case 'CREATE':
      return `수정된 태그: ${afterTag}`;
    case 'REPLACE':
      return `변경 전 태그: ${beforeTag}, 변경된 태그: ${afterTag}`;
    case 'UPDATE_PROPS':
      return `수정된 태그: ${beforeTag}, 속성 변경 -> ${Object.entries(patch.propsDiff ?? {})
        .map(([key, value]) => `${key}: ${value === null ? 'remove' : `"${value}"`}`)
        .join(', ')}`;
    case 'TEXT':
      return `수정된 태그: ${beforeTag}, 내부 텍스트 -> "${patch.text ?? ''}"`;
    case 'DELETE':
      return `수정된 태그: ${beforeTag}`;
    default:
      return '';
  }
};

const renderPatchInspector = (
  patches,
  oldVNode = null,
  emptyMessage = '왼쪽 문서를 수정하면 patch 목록이 표시됩니다.',
) => {
  patchSummaryEl.textContent = patches.length === 0 ? 'No Patches' : `${patches.length} Patch${patches.length > 1 ? 'es' : ''}`;
  patchListEl.innerHTML = '';

  if (patches.length === 0) {
    const emptyItemEl = document.createElement('li');
    emptyItemEl.className = 'patch-empty';
    emptyItemEl.textContent = emptyMessage;
    patchListEl.appendChild(emptyItemEl);
    return;
  }

  patches.forEach((patch) => {
    const itemEl = document.createElement('li');
    const patchMetaText = getPatchMetaText(patch, oldVNode);
    const typeRowEl = document.createElement('div');
    const typeBadgeEl = document.createElement('span');
    const actionEl = document.createElement('div');

    typeBadgeEl.className = 'patch-type';
    typeBadgeEl.textContent = patch.type;
    typeRowEl.appendChild(typeBadgeEl);

    actionEl.className = 'patch-detail';
    const actionStrongEl = document.createElement('strong');
    actionStrongEl.textContent = getPatchActionText(patch);
    actionEl.appendChild(actionStrongEl);

    itemEl.appendChild(typeRowEl);
    itemEl.appendChild(actionEl);

    if (patchMetaText) {
      const metaEl = document.createElement('div');
      metaEl.className = 'patch-detail';
      metaEl.textContent = `세부값: ${patchMetaText}`;
      itemEl.appendChild(metaEl);
    }

    patchListEl.appendChild(itemEl);
  });
};

const updateButtonState = () => {
  backBtnEl.disabled = !history.canBack();
  patchBtnEl.disabled = isLiveSyncEnabled;
  forwardBtnEl.disabled = !history.canForward();
};

const updateSyncStatusLabel = (fallbackLabel) => {
  if (isLiveSyncEnabled) {
    setSyncState(fallbackLabel);
    return;
  }

  setSyncState(hasPendingChanges ? 'Manual Draft' : 'Manual Ready');
};

const stripKeysFromVNode = (vnode) => {
  if (typeof vnode === 'string') {
    return vnode;
  }

  return {
    type: vnode.type,
    props: { ...(vnode.props ?? {}) },
    children: (vnode.children ?? []).map((child) => stripKeysFromVNode(child)),
    key: undefined,
  };
};

const ensureEditorObserver = () => {
  if (editorObserver != null) {
    return;
  }

  editorObserver = new MutationObserver(() => {
    scheduleSync();
  });
};

const startEditorObserver = () => {
  ensureEditorObserver();
  editorObserver.observe(editorSurfaceEl, {
    childList: true,
    subtree: true,
    characterData: true,
  });
};

const stopEditorObserver = () => {
  editorObserver?.disconnect();
};

const syncEditorFromVNode = (vnode) => {
  isProgrammaticEditorUpdate = true;
  stopEditorObserver();
  editorSurfaceEl.innerHTML = '';
  editorSurfaceEl.appendChild(render(stripKeysFromVNode(vnode), { includeKeyAttribute: false }));
  startEditorObserver();
  isProgrammaticEditorUpdate = false;
};

const rerenderPreviewFromVNode = (vnode) => {
  previewAreaEl.innerHTML = '';
  previewAreaEl.appendChild(render(vnode));
};

const commitEditorChanges = () => {
  try {
    const oldVNode = history.current();

    if (oldVNode == null) {
      return;
    }

    const parsedVNode = stripKeysFromVNode(parseHTML(editorSurfaceEl.innerHTML));
    const newVNode = reconcileInternalKeys(oldVNode, parsedVNode, createInternalKey);
    const patches = diff(oldVNode, newVNode);
    renderPatchInspector(patches, oldVNode, '변경이 없어 patch가 생성되지 않았습니다.');

    if (patches.length === 0) {
      hasPendingChanges = false;
      updateButtonState();
      updateSyncStatusLabel('No Changes');
      return;
    }

    applyPatches(previewAreaEl, patches);
    history.push(newVNode);
    hasPendingChanges = false;
    updateButtonState();
    updateSyncStatusLabel(`Patched ${patches.length}`);
  } catch (error) {
    console.error(error);
    renderPatchInspector([], null, `Patch Inspector 오류: ${error.message}`);
    setSyncState('Patch Failed');
  }
};

const scheduleSync = () => {
  if (isProgrammaticEditorUpdate) {
    return;
  }

  hasPendingChanges = true;
  window.clearTimeout(syncTimerId);
  updateButtonState();

  if (!isLiveSyncEnabled) {
    setSyncState('Manual Draft');
    return;
  }

  setSyncState('Syncing...');
  syncTimerId = window.setTimeout(() => {
    commitEditorChanges();
  }, 180);
};

const initialize = () => {
  const initialVNode = assignInternalKeys(parseHTML(editorSurfaceEl.innerHTML), createInternalKey);

  if (initialVNode == null || typeof initialVNode === 'string') {
    throw new Error('editor-surface must contain a single root element for initialization.');
  }

  history.push(initialVNode);
  hasPendingChanges = false;
  isLiveSyncEnabled = liveSyncToggleEl.checked;
  syncEditorFromVNode(initialVNode);
  rerenderPreviewFromVNode(initialVNode);
  startEditorObserver();
  setControlsDisabled(false);
  updateButtonState();
  renderPatchInspector([], null, '초기 상태입니다. 문서를 수정하면 patch가 생성됩니다.');
  updateSyncStatusLabel('Ready');
};

editorSurfaceEl.addEventListener('input', scheduleSync);

patchBtnEl.addEventListener('click', () => {
  if (isLiveSyncEnabled) {
    return;
  }

  window.clearTimeout(syncTimerId);
  commitEditorChanges();
});

liveSyncToggleEl.addEventListener('change', () => {
  isLiveSyncEnabled = liveSyncToggleEl.checked;
  window.clearTimeout(syncTimerId);
  updateButtonState();

  if (isLiveSyncEnabled) {
    if (hasPendingChanges) {
      setSyncState('Syncing...');
      commitEditorChanges();
      return;
    }

    setSyncState('Ready');
    return;
  }

  setSyncState(hasPendingChanges ? 'Manual Draft' : 'Manual Ready');
});

backBtnEl.addEventListener('click', () => {
  const prevVNode = history.back();

  if (prevVNode == null) {
    return;
  }

  syncEditorFromVNode(prevVNode);
  rerenderPreviewFromVNode(prevVNode);
  hasPendingChanges = false;
  updateButtonState();
  renderPatchInspector([], null, 'History Back으로 상태를 복원했습니다.');
  updateSyncStatusLabel('History Back');
});

forwardBtnEl.addEventListener('click', () => {
  const nextVNode = history.forward();

  if (nextVNode == null) {
    return;
  }

  syncEditorFromVNode(nextVNode);
  rerenderPreviewFromVNode(nextVNode);
  hasPendingChanges = false;
  updateButtonState();
  renderPatchInspector([], null, 'History Forward로 상태를 복원했습니다.');
  updateSyncStatusLabel('History Forward');
});

const loadDependencies = async () => {
  try {
    const [{ diff: diffModule }, { createHistory: createHistoryModule }, vdomModule] =
      await Promise.all([
        import('./diff.js'),
        import('./history.js'),
        import('./vdom.js'),
      ]);

    diff = diffModule;
    createHistory = createHistoryModule;
    parseHTML = vdomModule.parseHTML;
    history = createHistory();

    initialize();
  } catch (error) {
    console.error(error);
    setControlsDisabled(true);
    setSyncState('Load Failed');
    renderPatchInspector([], null, '모듈 로딩에 실패했습니다.');
    editorSurfaceEl.innerHTML =
      '<p>Failed to load app modules. Check src/vdom.js, src/history.js, and src/diff.js.</p>';
  }
};

setControlsDisabled(true);
setSyncState('Loading...');
loadDependencies();
