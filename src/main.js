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

  // patch.path는 DOM 기준 인덱스 경로이므로,
  // inspector에서도 같은 규칙으로 VNode를 따라가며 대상 노드를 찾습니다.
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
    case 'MOVE':
      return '같은 노드를 유지한 채 순서만 이동합니다.';
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
    case 'MOVE':
      return `수정된 태그: ${beforeTag}, 기존 노드를 새 순서로 이동`;
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
      // innerHTML을 쓰면 <p> 같은 태그 문자열이 실제 태그로 해석될 수 있어 textContent를 씁니다.
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

  // 수동 모드에서는 "적용 안 된 편집본이 남아 있는지"를 우선 보여줍니다.
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

  // contenteditable은 input 이벤트만으로는 브라우저별 차이가 있어,
  // 실제 DOM 변경도 함께 감시합니다.
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
  // editor에는 key를 숨긴 버전을 보여서 사용자가 내부 추적 key를 직접 건드리지 않게 합니다.
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

    // 사용자가 편집한 DOM을 다시 keyless VDOM으로 만든 뒤,
    // 이전 keyed VDOM과 매칭해 내부 key를 복원합니다.
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
    // diff/patch가 끝난 새 VDOM이 다음 비교의 기준점이 됩니다.
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
    // 수동 모드에서는 편집만 표시하고 실제 patch는 버튼 클릭까지 보류합니다.
    setSyncState('Manual Draft');
    return;
  }

  setSyncState('Syncing...');
  syncTimerId = window.setTimeout(() => {
    commitEditorChanges();
  }, 180);
};

const initialize = () => {
  // 초기 editor HTML을 VDOM으로 읽을 때부터 내부 key를 붙여둬야
  // 이후 편집본과 비교할 때 key 기반 diff를 계속 유지할 수 있습니다.
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

  // 수동 모드에서만 강제로 현재 편집본을 diff/patch 합니다.
  window.clearTimeout(syncTimerId);
  commitEditorChanges();
});

liveSyncToggleEl.addEventListener('change', () => {
  isLiveSyncEnabled = liveSyncToggleEl.checked;
  window.clearTimeout(syncTimerId);
  updateButtonState();

  if (isLiveSyncEnabled) {
    if (hasPendingChanges) {
      // 수동 모드에서 쌓여 있던 draft가 있으면 토글을 켜는 즉시 한 번 반영합니다.
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
    // diff, history, vdom은 브라우저 로드 완료 후 동적으로 가져옵니다.
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
