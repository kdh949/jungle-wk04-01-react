import { applyPatches } from './patch.js';
import { render } from './renderer.js';

const realAreaEl = document.getElementById('real-area');
const testEditorEl = document.getElementById('test-editor');
const patchBtnEl = document.getElementById('btn-patch');
const backBtnEl = document.getElementById('btn-back');
const forwardBtnEl = document.getElementById('btn-forward');

let diff;
let createHistory;
let domToVNode;
let history;

const setControlsDisabled = (disabled) => {
  testEditorEl.contentEditable = String(!disabled);
  patchBtnEl.disabled = disabled;
  backBtnEl.disabled = disabled;
  forwardBtnEl.disabled = disabled;
};

const renderAreaFromVNode = (areaEl, vnode) => {
  areaEl.innerHTML = '';
  areaEl.appendChild(render(vnode));
};

const syncAreasFromVNode = (vnode) => {
  renderAreaFromVNode(realAreaEl, vnode);
  renderAreaFromVNode(testEditorEl, vnode);
};

const updateButtonState = () => {
  testEditorEl.contentEditable = 'true';
  patchBtnEl.disabled = false;
  backBtnEl.disabled = !history.canBack();
  forwardBtnEl.disabled = !history.canForward();
};

const findClosestListItem = (node) => {
  if (node instanceof Element) {
    return node.closest('li');
  }

  return node?.parentElement?.closest('li') ?? null;
};

const moveCaretToStart = (element) => {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};

const normalizeEditableTree = (rootEl) => {
  const clone = rootEl.cloneNode(true);

  clone.querySelectorAll('br').forEach((node) => {
    if (!node.previousSibling && !node.nextSibling) {
      node.remove();
    }
  });

  clone.querySelectorAll('ul, ol').forEach((listEl) => {
    const normalizedChildren = [];

    Array.from(listEl.childNodes).forEach((childNode) => {
      if (childNode.nodeType === Node.TEXT_NODE) {
        if ((childNode.textContent ?? '').trim() !== '') {
          const liEl = document.createElement('li');
          liEl.textContent = childNode.textContent;
          normalizedChildren.push(liEl);
        }

        return;
      }

      if (!(childNode instanceof Element)) {
        return;
      }

      if (childNode.tagName === 'LI') {
        const nestedBlocks = Array.from(childNode.children).filter((element) =>
          ['DIV', 'P'].includes(element.tagName),
        );

        if (nestedBlocks.length === 0) {
          normalizedChildren.push(childNode.cloneNode(true));
          return;
        }

        nestedBlocks.forEach((blockEl) => {
          const liEl = document.createElement('li');
          liEl.innerHTML = blockEl.innerHTML;
          normalizedChildren.push(liEl);
        });

        return;
      }

      if (['DIV', 'P'].includes(childNode.tagName)) {
        const liEl = document.createElement('li');
        liEl.innerHTML = childNode.innerHTML;
        normalizedChildren.push(liEl);
      }
    });

    listEl.replaceChildren(...normalizedChildren);
  });

  return clone;
};

const getVNodeFromTestArea = () => {
  const normalizedRootEl = normalizeEditableTree(testEditorEl);
  const children = Array.from(normalizedRootEl.childNodes)
    .map((childNode) => domToVNode(childNode))
    .filter((childNode) => childNode !== null);

  if (children.length === 1 && typeof children[0] !== 'string') {
    return children[0];
  }

  return {
    type: 'div',
    props: {},
    children,
  };
};

const applyPatchFromEditor = () => {
  const oldVNode = history.current();

  if (oldVNode == null) {
    return;
  }

  const newVNode = getVNodeFromTestArea();
  const patches = diff(oldVNode, newVNode);

  applyPatches(realAreaEl, patches);
  renderAreaFromVNode(testEditorEl, newVNode);
  history.push(newVNode);
  updateButtonState();
};

const initialize = () => {
  const initialVNode = domToVNode(realAreaEl.firstElementChild);

  if (initialVNode == null || typeof initialVNode === 'string') {
    throw new Error('real-area must contain a single root element for initialization.');
  }

  history.push(initialVNode);
  syncAreasFromVNode(initialVNode);
  updateButtonState();
};

patchBtnEl.addEventListener('click', applyPatchFromEditor);

testEditorEl.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey) {
    return;
  }

  const selection = window.getSelection();
  const currentLiEl = findClosestListItem(selection?.anchorNode ?? null);

  if (!currentLiEl || !testEditorEl.contains(currentLiEl)) {
    return;
  }

  event.preventDefault();

  const newLiEl = document.createElement('li');
  newLiEl.appendChild(document.createElement('br'));
  currentLiEl.insertAdjacentElement('afterend', newLiEl);
  moveCaretToStart(newLiEl);
});

backBtnEl.addEventListener('click', () => {
  const prevVNode = history.back();

  if (prevVNode == null) {
    return;
  }

  syncAreasFromVNode(prevVNode);
  updateButtonState();
});

forwardBtnEl.addEventListener('click', () => {
  const nextVNode = history.forward();

  if (nextVNode == null) {
    return;
  }

  syncAreasFromVNode(nextVNode);
  updateButtonState();
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
    domToVNode = vdomModule.domToVNode;
    history = createHistory();

    initialize();
  } catch (error) {
    console.error(error);
    setControlsDisabled(true);
    testEditorEl.textContent =
      'Failed to load app modules. Check src/vdom.js, src/history.js, and src/diff.js.';
  }
};

setControlsDisabled(true);
loadDependencies();
