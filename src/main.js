import { applyPatches } from './patch.js';
import { render } from './renderer.js';

const realAreaEl = document.getElementById('real-area');
const testTextareaEl = document.getElementById('test-textarea');
const patchBtnEl = document.getElementById('btn-patch');
const backBtnEl = document.getElementById('btn-back');
const forwardBtnEl = document.getElementById('btn-forward');

let diff;
let createHistory;
let domToVNode;
let parseHTML;
let history;

const setControlsDisabled = (disabled) => {
  patchBtnEl.disabled = disabled;
  backBtnEl.disabled = disabled;
  forwardBtnEl.disabled = disabled;
};

const rerenderFromVNode = (vnode) => {
  realAreaEl.innerHTML = '';
  realAreaEl.appendChild(render(vnode));
  testTextareaEl.value = realAreaEl.innerHTML;
};

const updateButtonState = () => {
  backBtnEl.disabled = !history.canBack();
  forwardBtnEl.disabled = !history.canForward();
};

const initialize = () => {
  const initialVNode = domToVNode(realAreaEl.firstElementChild);

  if (initialVNode == null || typeof initialVNode === 'string') {
    throw new Error('real-area must contain a single root element for initialization.');
  }

  history.push(initialVNode);
  rerenderFromVNode(initialVNode);
  updateButtonState();
};

patchBtnEl.addEventListener('click', () => {
  const oldVNode = history.current();

  if (oldVNode == null) {
    return;
  }

  const newVNode = parseHTML(testTextareaEl.value);
  const patches = diff(oldVNode, newVNode);

  applyPatches(realAreaEl, patches);
  history.push(newVNode);
  testTextareaEl.value = realAreaEl.innerHTML;
  updateButtonState();
});

backBtnEl.addEventListener('click', () => {
  const prevVNode = history.back();

  if (prevVNode == null) {
    return;
  }

  rerenderFromVNode(prevVNode);
  updateButtonState();
});

forwardBtnEl.addEventListener('click', () => {
  const nextVNode = history.forward();

  if (nextVNode == null) {
    return;
  }

  rerenderFromVNode(nextVNode);
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
    parseHTML = vdomModule.parseHTML;
    history = createHistory();

    initialize();
  } catch (error) {
    console.error(error);
    setControlsDisabled(true);
    testTextareaEl.value =
      'Member A/B modules are not connected yet.\n' +
      'Expected: src/vdom.js, src/history.js, src/diff.js';
  }
};

setControlsDisabled(true);
loadDependencies();
