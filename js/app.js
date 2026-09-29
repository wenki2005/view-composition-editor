const $ = (selector) => document.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  projects: [],
  currentProject: null,
  currentPage: 'index.html',
  pages: [],
  doc: null,
  selected: null,
  activePanel: 'layers',
  history: [],
  historyIndex: -1,
  assets: [],
  selectedAsset: null,
  dirty: false,
  rangeDragging: null,
  observer: null,
  dragSession: null,
  resizeSession: null,
  snapEnabled: true,
  testPreview: false,
  previewHtml: '',
  interactionDispatch: false,
  leftSelectionSession: null,
  collapsedLayers: new Set(),
  layersCollapsed: false,
  scaleBaseTransforms: new WeakMap(),
  device: { key: 'desktop', width: 1280, height: 800, label: '桌面' },
  scenes: [],
  currentSceneId: null,
  agentSessionId: '',
  agentBusy: false,
  agentPendingOperations: [],
  folderBrowser: { path: null, parent: null, selected: null },
};

const els = {
  projectSelect: $('#projectSelect'),
  pageSelect: $('#pageSelect'),
  devicePreset: $('#devicePreset'),
  viewportWidth: $('#viewportWidth'),
  viewportHeight: $('#viewportHeight'),
  preview: $('#previewFrame'),
  frameWrap: $('#frameWrap'),
  canvasStage: $('#canvasStage'),
  projectTitle: $('#canvasTitle'),
  layerTree: $('#layerTree'),
  layerCount: $('#layerCount'),
  layerSearch: $('#layerSearch'),
  assetGrid: $('#assetGrid'),
  assetCount: $('#assetCount'),
  assetUpload: $('#assetUpload'),
  assetSelectionHint: $('#assetSelectionHint'),
  inspectorEmpty: $('#inspectorEmpty'),
  inspectorContent: $('#inspectorContent'),
  inspectorTitle: $('#inspectorTitle'),
  selectionSummary: $('#selectionSummary'),
  selectionHud: $('#selectionHud'),
  selectionBox: $('#selectionBox'),
  hudTag: $('#hudTag'),
  hudSize: $('#hudSize'),
  saveSummary: $('#saveSummary'),
  historyStatus: $('#historyStatus'),
  connectionStatus: $('#connectionStatus'),
  toast: $('#toast'),
  browseProjects: $('#browseProjects'),
  folderDialog: $('#folderDialog'),
  folderPath: $('#folderPath'),
  folderEntries: $('#folderEntries'),
  folderUp: $('#folderUp'),
  folderGo: $('#folderGo'),
  openFolderProject: $('#openFolderProject'),
  folderSelectionHint: $('#folderSelectionHint'),
  confirmSelection: $('#confirmSelection'),
  snapTool: $('#snapTool'),
  testPreviewButton: $('#testPreviewButton'),
  frameBadge: $('#frameBadge'),
  lockElement: $('#lockElement'),
  deleteElement: $('#deleteElement'),
  collapseLayers: $('#collapseLayers'),
  browserTabTitle: $('#browserTabTitle'),
  browserAddressText: $('#browserAddressText'),
  sceneName: $('#sceneName'),
  captureScene: $('#captureScene'),
  sceneList: $('#sceneList'),
  sceneCount: $('#sceneCount'),
  aiStatus: $('#aiStatus'),
  agentSettings: $('#agentSettings'),
  agentSettingsToggle: $('#agentSettingsToggle'),
  agentSession: $('#agentSession'),
  newAgentSession: $('#newAgentSession'),
  agentProvider: $('#agentProvider'),
  agentModel: $('#agentModel'),
  agentApiUrl: $('#agentApiUrl'),
  agentApiKey: $('#agentApiKey'),
  saveAgentSettings: $('#saveAgentSettings'),
  testAgentConnection: $('#testAgentConnection'),
  resetAgentSession: $('#resetAgentSession'),
  agentConnection: $('#agentConnection'),
  agentMessages: $('#agentMessages'),
  agentInput: $('#agentInput'),
  sendAgentMessage: $('#sendAgentMessage'),
};

const DEVICE_PRESETS = {
  phone: { width: 390, height: 844, label: '手机' },
  phoneWide: { width: 844, height: 390, label: '手机横屏' },
  tablet: { width: 820, height: 1180, label: '平板' },
  tabletWide: { width: 1180, height: 820, label: '平板横屏' },
  laptop: { width: 1366, height: 768, label: '笔记本' },
  desktop: { width: 1280, height: 800, label: '桌面' },
  custom: { width: 1280, height: 800, label: '自定义' },
};

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
  return payload;
}

function notify(message, type = 'info') {
  els.toast.textContent = message;
  els.toast.dataset.type = type;
  els.toast.classList.add('is-visible');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => els.toast.classList.remove('is-visible'), 2400);
}

function snapValue(value, step = 8) {
  return state.snapEnabled ? Math.round(value / step) * step : Math.round(value);
}

function requireConfirmedSelection() {
  if (!state.selected?.element) return false;
  if (!state.selected.confirmed) {
    notify('请先点击选框上的“确认选择”');
    return false;
  }
  return true;
}

function projectUrl(project, relative = 'index.html') {
  const path = relative.split('/').map(encodeURIComponent).join('/');
  return `/site/${encodeURIComponent(project)}/${path}`;
}

function directText(element) {
  return [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(' ').replace(/\s+/g, ' ').trim();
}

function elementLabel(element) {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = [...element.classList].slice(0, 2).map((name) => `.${name}`).join('');
  const text = directText(element) || element.getAttribute('aria-label') || element.getAttribute('alt') || '';
  return { tag, selector: `${tag}${id || classes}`, text: text.slice(0, 52) };
}

function selectorFor(element) {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const parts = [];
  let node = element;
  while (node && node.nodeType === Node.ELEMENT_NODE && node !== state.doc.body) {
    let part = node.tagName.toLowerCase();
    if (node.classList.length) part += `.${[...node.classList].slice(0, 2).map((name) => CSS.escape(name)).join('.')}`;
    const siblings = node.parentElement ? [...node.parentElement.children].filter((child) => child.tagName === node.tagName) : [];
    if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.length ? `body > ${parts.join(' > ')}` : 'body';
}

function elementFromSelector(selector) {
  try { return state.doc?.querySelector(selector) || null; } catch { return null; }
}

function injectEditorStyle() {
  const previous = state.doc.querySelector('style[data-vse-editor-style]');
  previous?.remove();
  const style = state.doc.createElement('style');
  style.dataset.vseEditorStyle = 'true';
  style.textContent = `
    [data-vse-selected] { outline: 2px solid #f5b85b !important; outline-offset: 3px !important; cursor: crosshair !important; }
    [data-vse-hover] { outline: 1px dashed #72c9d8 !important; outline-offset: 2px !important; }
    [data-vse-locked] { outline: 1px dashed #72c9d8 !important; outline-offset: 2px !important; }
  `;
  state.doc.head.appendChild(style);
}

function selectableFromTarget(target) {
  let element = target?.closest?.('body *') || state.doc?.body;
  if (!element || ['SCRIPT', 'STYLE', 'HTML', 'HEAD'].includes(String(element.tagName || '').toUpperCase())) return null;
  while (element !== state.doc.body && element.hasAttribute('data-vse-locked')) element = element.parentElement || state.doc.body;
  return element;
}

function setEditorListeners() {
  const doc = state.doc;
  doc.addEventListener('pointerdown', (event) => {
    if (state.interactionDispatch || event.button !== 0) return;
    const target = selectableFromTarget(event.target);
    if (!target) return;
    state.leftSelectionSession = { target, startX: event.clientX, startY: event.clientY, moved: false };
    event.preventDefault();
    event.stopPropagation();
  }, true);
  doc.addEventListener('pointermove', (event) => {
    const selection = state.leftSelectionSession;
    if (!selection) return;
    const dx = event.clientX - selection.startX;
    const dy = event.clientY - selection.startY;
    if (Math.abs(dx) + Math.abs(dy) >= 3) selection.moved = true;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  doc.addEventListener('pointerup', (event) => {
    const selection = state.leftSelectionSession;
    if (!selection || event.button !== 0) return;
    const target = selectableFromTarget(event.target);
    if (!selection.moved && target === selection.target) selectElement(target);
    state.leftSelectionSession = null;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  doc.addEventListener('pointerover', (event) => {
    const element = event.target.closest?.('body *');
    if (!element || element === doc.body || ['SCRIPT', 'STYLE', 'HTML', 'HEAD'].includes(element.tagName)) return;
    $$("[data-vse-hover]", doc).forEach((node) => node.removeAttribute('data-vse-hover'));
    if (element !== state.selected?.element) element.setAttribute('data-vse-hover', 'true');
  }, true);
  doc.addEventListener('pointerout', (event) => {
    const element = event.target.closest?.('[data-vse-hover]');
    element?.removeAttribute('data-vse-hover');
  }, true);
  doc.addEventListener('click', (event) => {
    if (state.interactionDispatch) return;
    const element = selectableFromTarget(event.target);
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    selectElement(element);
  }, true);
  doc.addEventListener('contextmenu', (event) => {
    const target = event.target.closest?.('body *') || doc.body;
    if (['SCRIPT', 'STYLE', 'HTML', 'HEAD'].includes(target.tagName)) return;
    event.preventDefault();
    event.stopPropagation();
    state.interactionDispatch = true;
    for (const type of ['mousedown', 'mouseup', 'click']) {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: doc.defaultView, button: 0, buttons: 0 }));
    }
    state.interactionDispatch = false;
    notify('已执行右键交互，页面状态已更新');
  }, true);
}

function setupFrame() {
  state.doc = els.preview.contentDocument;
  if (!state.doc?.body) return;
  state.observer?.disconnect();
  if (state.testPreview) {
    state.selected = null;
    els.selectionBox.classList.add('is-hidden');
    els.selectionHud.classList.add('is-hidden');
    renderLayers();
    renderInspector();
    updateFrameHeight();
    requestAnimationFrame(() => fitCanvas());
    return;
  }
  injectEditorStyle();
  setEditorListeners();
  renderLayers();
  renderInspector();
  let observerTimer;
  state.observer = new MutationObserver(() => {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(() => { renderLayers(); updateFrameHeight(); }, 180);
  });
  state.observer.observe(state.doc.body, { childList: true, subtree: true });
  if (state.historyIndex < 0) {
    state.history = [serializeDocument()];
    state.historyIndex = 0;
  }
  updateHistoryButtons();
  updateFrameHeight();
  requestAnimationFrame(() => fitCanvas());
}

function selectElement(element, confirmed = false, respectLock = true) {
  if (state.testPreview) return;
  if (!element || !state.doc) return;
  if (state.selected?.confirmed && state.selected.element && element !== state.selected.element) {
    notify('当前元素已确认选择。点击“取消选择”后，才能切换到其他元素。');
    return;
  }
  if (respectLock) while (element !== state.doc.body && element.hasAttribute('data-vse-locked')) element = element.parentElement || state.doc.body;
  $$("[data-vse-selected]", state.doc).forEach((node) => node.removeAttribute('data-vse-selected'));
  element.setAttribute('data-vse-selected', 'true');
  const meta = elementLabel(element);
  state.selected = { element, selector: selectorFor(element), confirmed, ...meta };
  if (element.tagName === 'IMG') {
    const source = normalizeAssetReference(element.getAttribute('src') || '');
    const matchingAsset = state.assets.find((asset) => source === normalizeAssetReference(`assets/${asset.path}`) || source.endsWith(`/${normalizeAssetReference(`assets/${asset.path}`)}`));
    setAssetSelection(matchingAsset || null);
  } else setAssetSelection(null);
  renderLayers();
  renderInspector();
  updateSelectionHud();
  els.selectionSummary.textContent = `${meta.tag}${element.id ? `#${element.id}` : ''} · ${state.selected.selector} · ${confirmed ? '已确认' : '待确认'}`;
  updateAiTarget();
}

function confirmSelection() {
  if (!state.selected?.element) return;
  if (state.selected.confirmed) {
    state.selected.confirmed = false;
    renderInspector();
    updateSelectionHud();
    const meta = elementLabel(state.selected.element);
    els.selectionSummary.textContent = `${meta.tag}${state.selected.element.id ? `#${state.selected.element.id}` : ''} · 待确认`;
    notify('已取消确认，现在可以选择其他元素');
    return;
  }
  state.selected.confirmed = true;
  renderInspector();
  updateSelectionHud();
  els.selectionSummary.textContent = `${state.selected.tag}${state.selected.element.id ? `#${state.selected.element.id}` : ''} · 已确认选择`;
  notify('已确认选择，点击其他元素不会切换；再次点击此按钮可取消选择');
}

function toggleElementLock() {
  if (!requireConfirmedSelection()) return;
  const element = state.selected.element;
  const locked = element.hasAttribute('data-vse-locked');
  if (locked) {
    element.removeAttribute('data-vse-locked');
    notify('已解除固定，可以再次选择此元素');
  } else {
    element.setAttribute('data-vse-locked', 'true');
    notify('元素已固定，点击时会跳过它以便编辑更深层元素');
  }
  renderLayers();
  renderInspector();
  updateSelectionHud();
}

function deleteSelectedElement() {
  if (!requireConfirmedSelection()) return;
  const element = state.selected.element;
  if (!element.parentElement || element === state.doc.body || element === state.doc.documentElement) return notify('页面根节点不能删除');
  const label = elementLabel(element);
  if (!window.confirm(`确定删除 ${label.selector || label.tag} 吗？此操作可以使用撤销恢复。`)) return;
  element.remove();
  commitHistory();
  clearSelection();
  notify('元素已删除，可以使用撤销恢复');
}

function clearSelection() {
  $$("[data-vse-selected]", state.doc).forEach((node) => node.removeAttribute('data-vse-selected'));
  state.selected = null;
  els.lockElement.disabled = true;
  els.lockElement.textContent = '固定元素';
  els.deleteElement.disabled = true;
  els.selectionBox.classList.add('is-hidden');
  els.selectionHud.classList.add('is-hidden');
  els.selectionHud.classList.remove('is-confirmed');
  renderLayers();
  renderInspector();
  els.selectionSummary.textContent = '左键选择元素 · 右键触发交互';
  updateAiTarget();
}

function renderLayers() {
  if (!state.doc?.body) return;
  const search = els.layerSearch.value.trim().toLowerCase();
  const nodes = $$('body *', state.doc).filter((node) => !['SCRIPT', 'STYLE', 'META', 'LINK', 'NOSCRIPT'].includes(String(node.tagName || '').toUpperCase())).slice(0, 240);
  const matches = new Set(nodes.filter((node) => {
    const meta = elementLabel(node);
    return !search || `${meta.tag} ${meta.text} ${node.id} ${node.className}`.toLowerCase().includes(search);
  }));
  const allowed = new Set(nodes);
  els.layerCount.textContent = nodes.length;
  els.layerTree.replaceChildren();
  if (!matches.size) {
    const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = '没有匹配的元素'; els.layerTree.append(empty); return;
  }

  const hasMatchingDescendant = (node) => [...node.children].some((child) => matches.has(child) || hasMatchingDescendant(child));
  const isCollapsed = (node) => !search && (state.layersCollapsed || state.collapsedLayers.has(selectorFor(node)));
  const appendNode = (node, depth = 0, ancestorCollapsed = false) => {
    if (ancestorCollapsed || !allowed.has(node)) return;
    const hasChildren = node.children.length > 0;
    const shouldShow = !search || matches.has(node) || hasMatchingDescendant(node);
    if (!shouldShow) return;
    const row = document.createElement('button');
    row.type = 'button'; row.className = `layer-row${node === state.selected?.element ? ' is-selected' : ''}${node.hasAttribute('data-vse-locked') ? ' is-locked' : ''}`;
    row.style.setProperty('--indent', `${Math.min(depth, 8) * 14}px`);
    const meta = elementLabel(node);
    const collapsed = isCollapsed(node);
    row.innerHTML = `<span class="layer-indent"></span><span class="layer-toggle${hasChildren ? '' : ' is-empty'}" aria-hidden="true">${hasChildren ? (collapsed ? '›' : '⌄') : '·'}</span><span class="layer-tag">${meta.tag}</span><span class="layer-label"></span><span class="layer-meta">${hasChildren ? `${node.children.length}↳` : ''}</span>`;
    row.querySelector('.layer-label').textContent = `${node.hasAttribute('data-vse-locked') ? '◆ ' : ''}${meta.text || (node.id ? `#${node.id}` : node.classList[0] ? `.${node.classList[0]}` : '无文本')}`;
    row.addEventListener('click', () => selectElement(node, false, false));
    row.querySelector('.layer-toggle')?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!hasChildren) return;
      const key = selectorFor(node);
      if (state.collapsedLayers.has(key)) state.collapsedLayers.delete(key);
      else state.collapsedLayers.add(key);
      renderLayers();
    });
    els.layerTree.append(row);
    if (hasChildren) [...node.children].forEach((child) => appendNode(child, depth + 1, collapsed && !search));
  };
  [...state.doc.body.children].forEach((node) => appendNode(node));
  if (!els.layerTree.children.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = '没有匹配的元素'; els.layerTree.append(empty);
  }
}

function computedStyle(name) {
  if (!state.selected?.element) return '';
  const element = state.selected.element;
  return element.style[name] || state.doc.defaultView.getComputedStyle(element)[name] || '';
}

function elementScale(element) {
  const stored = Number.parseFloat(element.getAttribute('data-vse-editor-scale') || '');
  if (Number.isFinite(stored) && stored > 0) return stored;
  const transform = element.style.transform || state.doc?.defaultView?.getComputedStyle(element).transform || '';
  const scaleMatch = transform.match(/scale(?:3d|x|y)?\(\s*([-+.\d]+)(?:[eE][-+]?\d+)?/i);
  if (scaleMatch) return Number.parseFloat(scaleMatch[1]) || 1;
  const matrix = transform.match(/matrix(?:3d)?\(([^)]+)\)/i);
  if (matrix) {
    const values = matrix[1].split(',').map(Number);
    if (values.length >= 6) return Math.sqrt((values[0] ** 2) + (values[1] ** 2)) || 1;
  }
  return 1;
}

function baseTransform(element) {
  if (state.scaleBaseTransforms.has(element)) return state.scaleBaseTransforms.get(element);
  const computed = state.doc?.defaultView?.getComputedStyle(element).transform || '';
  const current = element.style.transform || (computed && computed !== 'none' && computed !== 'matrix(1, 0, 0, 1, 0, 0)' ? computed : '');
  const base = current.replace(/\s*scale(?:3d|x|y)?\([^)]*\)/gi, '').replace(/\s+/g, ' ').trim();
  state.scaleBaseTransforms.set(element, base);
  return base;
}

function setElementScale(value, { history = true } = {}) {
  if (!requireConfirmedSelection()) return;
  const element = state.selected.element;
  const scale = Math.max(.25, Math.min(3, Number(value) / 100 || 1));
  const base = baseTransform(element);
  if (Math.abs(scale - 1) < .001) {
    if (base) element.style.transform = base;
    else element.style.removeProperty('transform');
    element.removeAttribute('data-vse-editor-scale');
  } else {
    element.style.transform = `${base ? `${base} ` : ''}scale(${scale})`;
    element.setAttribute('data-vse-editor-scale', String(scale));
  }
  const percent = Math.round(scale * 100);
  $('#scaleRange').value = percent;
  $('#scaleInput').value = percent;
  $('#scaleValueLabel').textContent = `${percent}%`;
  renderInspector(); updateSelectionHud();
  if (history) commitHistory();
}

function renderInspector() {
  const selected = state.selected?.element;
  const hasSelection = Boolean(selected);
  els.inspectorEmpty.classList.toggle('is-hidden', hasSelection);
  els.inspectorContent.classList.toggle('is-hidden', !hasSelection);
  if (!selected) { els.inspectorTitle.textContent = '未选择元素'; return; }
  const meta = elementLabel(selected);
  els.inspectorTitle.textContent = `${state.selected.confirmed ? '' : '待确认 · '}${meta.text ? `${meta.tag} · ${meta.text}` : meta.selector}`;
  els.lockElement.disabled = !state.selected.confirmed;
  els.lockElement.textContent = selected.hasAttribute('data-vse-locked') ? '解除固定' : '固定元素';
  els.deleteElement.disabled = !state.selected.confirmed || selected === state.doc.body || selected === state.doc.documentElement;
  $('#styleLeft').value = computedStyle('left');
  $('#styleTop').value = computedStyle('top');
  $('#styleWidth').value = computedStyle('width');
  $('#styleHeight').value = computedStyle('height');
  $('#styleOpacity').value = computedStyle('opacity');
  $('#styleRadius').value = computedStyle('borderRadius');
  $('#styleBackground').value = computedStyle('backgroundColor');
  $('#styleZIndex').value = computedStyle('zIndex');
  const scalePercent = Math.round(elementScale(selected) * 100);
  $('#scaleRange').value = Math.max(25, Math.min(300, scalePercent));
  $('#scaleInput').value = scalePercent;
  $('#scaleValueLabel').textContent = `${scalePercent}%`;
  $('#scaleRange').disabled = !state.selected.confirmed;
  $('#scaleInput').disabled = !state.selected.confirmed;
  $('#resetScale').disabled = !state.selected.confirmed;
  $('#relativePosition').checked = ['relative', 'absolute', 'fixed', 'sticky'].includes(computedStyle('position'));
  $('#textContent').value = directText(selected);
  const isImage = selected.tagName === 'IMG';
  $('#imageSection').classList.toggle('is-hidden', !isImage);
  if (isImage) $('#imageSrc').value = selected.getAttribute('src') || '';
  renderTriggerControls();
}

function updateSelectionHud() {
  const selected = state.selected?.element;
  if (!selected) { els.selectionBox.classList.add('is-hidden'); els.selectionHud.classList.add('is-hidden'); return; }
  const rect = selected.getBoundingClientRect();
  const iframeRect = els.preview.getBoundingClientRect();
  els.selectionHud.style.left = `${iframeRect.left + rect.left}px`;
  const hudTop = Math.max(8, Math.min(window.innerHeight - 36, iframeRect.top + rect.top - 30));
  els.selectionHud.style.top = `${hudTop}px`;
  els.selectionBox.style.left = `${iframeRect.left + rect.left}px`;
  els.selectionBox.style.top = `${iframeRect.top + rect.top}px`;
  els.selectionBox.style.width = `${rect.width}px`;
  els.selectionBox.style.height = `${rect.height}px`;
  els.selectionBox.classList.remove('is-hidden');
  els.hudTag.textContent = selected.tagName.toLowerCase();
  els.hudSize.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  els.selectionHud.classList.toggle('is-confirmed', Boolean(state.selected.confirmed));
  els.confirmSelection.textContent = state.selected.confirmed ? '取消选择' : '确认选择';
  els.confirmSelection.title = state.selected.confirmed ? '释放当前元素，允许切换选择' : '锁定当前元素为编辑焦点';
  els.selectionHud.classList.remove('is-hidden');
}

function setStyle(name, value, { history = true } = {}) {
  if (!requireConfirmedSelection()) return;
  if (name === 'left' || name === 'top') {
    if (!['relative', 'absolute', 'fixed', 'sticky'].includes(state.selected.element.style.position)) state.selected.element.style.position = 'relative';
  }
  state.selected.element.style[name] = value;
  renderInspector(); updateSelectionHud(); renderLayers();
  if (history) commitHistory();
}

function commitHistory() {
  const current = serializeDocument();
  if (state.history[state.historyIndex] === current) return;
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(current);
  state.historyIndex = state.history.length - 1;
  state.dirty = true;
  updateHistoryButtons();
  els.saveSummary.textContent = '有未保存修改';
}

function serializeDocument() {
  if (!state.doc?.documentElement) return '';
  const clone = state.doc.documentElement.cloneNode(true);
  clone.querySelectorAll('[data-vse-selected], [data-vse-hover], [data-vse-locked], [data-vse-editor-scale]').forEach((node) => { node.removeAttribute('data-vse-selected'); node.removeAttribute('data-vse-hover'); node.removeAttribute('data-vse-locked'); node.removeAttribute('data-vse-editor-scale'); });
  clone.querySelectorAll('style[data-vse-editor-style]').forEach((node) => node.remove());
  clone.querySelectorAll('base[data-vse-editor-base]').forEach((node) => node.remove());
  return `<!doctype html>\n${clone.outerHTML}`;
}

function updateHistoryButtons() {
  const canUndo = state.historyIndex > 0;
  const canRedo = state.historyIndex >= 0 && state.historyIndex < state.history.length - 1;
  $('#undoButton').disabled = !canUndo;
  $('#redoButton').disabled = !canRedo;
  $('#undoButton').title = canUndo ? `撤销最近一步（Ctrl+Z）` : '没有可撤销的步骤';
  $('#redoButton').title = canRedo ? `恢复刚撤销的步骤（Ctrl+Y）` : '没有可恢复的步骤';
  els.historyStatus.textContent = `${Math.max(0, state.historyIndex)} / ${Math.max(0, state.history.length - 1)} 步`;
}

function undoStep() {
  if (state.historyIndex <= 0) return notify('已经是最初状态');
  state.historyIndex -= 1;
  restoreHtml(state.history[state.historyIndex]);
  state.dirty = true;
  updateHistoryButtons();
  els.saveSummary.textContent = '有未保存修改';
  notify('已撤销一步');
}

function redoStep() {
  if (state.historyIndex < 0 || state.historyIndex >= state.history.length - 1) return notify('没有可恢复的步骤');
  state.historyIndex += 1;
  restoreHtml(state.history[state.historyIndex]);
  state.dirty = true;
  updateHistoryButtons();
  els.saveSummary.textContent = '有未保存修改';
  notify('已恢复一步');
}

function addPreviewBase(html) {
  const base = `<base data-vse-editor-base="true" href="${projectUrl(state.currentProject, state.currentPage)}">`;
  return html.replace(/<head([^>]*)>/i, `<head$1>${base}`);
}

function restoreHtml(html) {
  clearSelection();
  const onload = () => { els.preview.removeEventListener('load', onload); setupFrame(); };
  els.preview.addEventListener('load', onload);
  els.preview.srcdoc = addPreviewBase(html);
}

function toggleTestPreview() {
  if (state.testPreview) {
    state.testPreview = false;
    els.testPreviewButton.textContent = '测试预览';
    els.testPreviewButton.classList.remove('is-active');
    els.frameBadge.textContent = '编辑模式';
    els.connectionStatus.textContent = `已连接 · ${state.projects.find((item) => item.id === state.currentProject)?.name || state.currentProject}`;
    restoreHtml(state.previewHtml || serializeDocument());
    return;
  }
  if (!state.doc) return notify('页面还没有加载完成');
  state.previewHtml = serializeDocument();
  state.testPreview = true;
  clearSelection();
  els.testPreviewButton.textContent = '退出预览';
  els.testPreviewButton.classList.add('is-active');
  els.frameBadge.textContent = '测试预览';
  els.connectionStatus.textContent = '测试预览 · 点击页面进行真实交互';
  const onload = () => { els.preview.removeEventListener('load', onload); setupFrame(); };
  els.preview.addEventListener('load', onload);
  els.preview.srcdoc = addPreviewBase(state.previewHtml);
}

function triggerData(element = state.selected?.element) {
  if (!element) return null;
  try { return JSON.parse(element.getAttribute('data-vse-trigger') || 'null'); } catch { return null; }
}

function nativeInteraction(element = state.selected?.element) {
  if (!element) return null;
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute('role')?.toLowerCase();
  const inlineEvent = [...element.attributes].find((attribute) => /^on(click|change|input|submit|toggle|pointerdown|pointerup)$/i.test(attribute.name));
  if (tag === 'button' || role === 'button') return { label: '原生按钮', event: 'click' };
  if (tag === 'a' && element.hasAttribute('href')) return { label: '链接', event: 'click' };
  if (['input', 'select', 'textarea'].includes(tag)) return { label: '表单控件', event: tag === 'input' && ['button', 'submit', 'reset', 'checkbox', 'radio'].includes(element.type) ? 'click' : 'change' };
  if (tag === 'summary') return { label: '折叠面板', event: 'toggle' };
  if (inlineEvent) return { label: '页面事件', event: inlineEvent.name.slice(2) };
  if (element.hasAttribute('tabindex') || element.hasAttribute('contenteditable') || element.hasAttribute('draggable')) return { label: '可交互元素', event: 'click' };
  return null;
}

function renderTriggerControls() {
  const configuredTrigger = triggerData();
  const trigger = configuredTrigger || { type: 'none', effect: 'none', rangeStart: 20, rangeEnd: 80, padding: 0 };
  const native = nativeInteraction();
  const nativeType = ['hover', 'click', 'appear', 'scroll', 'viewProgress'].includes(native?.event) ? native.event : 'none';
  $('#triggerType').value = configuredTrigger ? (trigger.type || 'none') : nativeType;
  $('#triggerEffect').value = trigger.effect || 'none';
  $('#triggerStart').value = trigger.rangeStart ?? 20;
  $('#triggerEnd').value = trigger.rangeEnd ?? 80;
  $('#triggerPadding').value = trigger.padding ?? 0;
  $('#triggerBadge').textContent = configuredTrigger ? String(trigger.type || 'none').toUpperCase() : native ? 'NATIVE' : 'NONE';
  const isRange = ['scroll', 'viewProgress'].includes(trigger.type);
  $('#rangeEditor').classList.toggle('is-hidden', !isRange);
  $('#rangeStartHandle').style.left = `${trigger.rangeStart ?? 20}%`;
  $('#rangeEndHandle').style.left = `${trigger.rangeEnd ?? 80}%`;
  $('#rangeFill').style.left = `${trigger.rangeStart ?? 20}%`;
  $('#rangeFill').style.right = `${100 - (trigger.rangeEnd ?? 80)}%`;
  const summary = $('#triggerSummary');
  summary.classList.toggle('is-native', Boolean(native && !configuredTrigger));
  summary.dataset.kind = !state.selected ? 'empty' : configuredTrigger && trigger.type !== 'none' ? 'configured' : native ? 'native' : 'none';
  summary.textContent = !state.selected
    ? '先在画布中选中一个元素。'
    : configuredTrigger && trigger.type !== 'none'
      ? `编辑器触发器：${trigger.type} · ${trigger.effect || '无动画'} · ${trigger.rangeStart ?? 20}% → ${trigger.rangeEnd ?? 80}%`
      : native
        ? `${native.label} · ${native.event} 交互已保留；还没有额外的编辑器触发器。`
        : '当前元素没有可识别的交互触发器。';
}

function writeTrigger({ history = true } = {}) {
  if (!requireConfirmedSelection()) return;
  const type = $('#triggerType').value;
  if (type === 'none') state.selected.element.removeAttribute('data-vse-trigger');
  else {
    const payload = { type, effect: $('#triggerEffect').value, rangeStart: Number($('#triggerStart').value), rangeEnd: Number($('#triggerEnd').value), padding: Number($('#triggerPadding').value) };
    payload.rangeStart = Math.max(0, Math.min(100, payload.rangeStart));
    payload.rangeEnd = Math.max(payload.rangeStart, Math.min(100, payload.rangeEnd));
    state.selected.element.setAttribute('data-vse-trigger', JSON.stringify(payload));
  }
  renderTriggerControls(); renderLayers();
  if (history) commitHistory();
}

function normalizeAssetReference(value = '') {
  return decodeURIComponent(String(value).split('?')[0]).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
}

function findImageForAsset(asset) {
  if (!state.doc?.body || !asset) return null;
  const target = normalizeAssetReference(`assets/${asset.path}`);
  return $$('img', state.doc).find((image) => {
    const source = normalizeAssetReference(image.getAttribute('src') || '');
    return source === target || source.endsWith(`/${target}`);
  }) || null;
}

function setAssetSelection(asset) {
  state.selectedAsset = asset || null;
  if (els.assetSelectionHint) els.assetSelectionHint.textContent = asset ? `当前素材：${asset.path}` : '先点击一张素材';
  $$('.asset-card', els.assetGrid).forEach((card) => card.classList.toggle('is-selected', card.dataset.path === asset?.path));
}

function replaceImageElementSource(element, relative, message = '图片已替换，保存后写回项目') {
  if (!element || element.tagName !== 'IMG') return false;
  element.setAttribute('src', relative);
  $('#imageSrc').value = relative;
  commitHistory();
  renderInspector();
  updateSelectionHud();
  notify(message);
  return true;
}

function renderAssets() {
  els.assetCount.textContent = state.assets.length;
  els.assetGrid.replaceChildren();
  if (!state.assets.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'assets 目录里还没有素材。'; els.assetGrid.append(empty); return; }
  for (const asset of state.assets) {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'asset-card';
    card.dataset.path = asset.path;
    card.classList.toggle('is-selected', state.selectedAsset?.path === asset.path);
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg'].includes(asset.type);
    if (isImage) {
      const image = document.createElement('img'); image.loading = 'lazy'; image.alt = asset.path; image.src = projectUrl(state.currentProject, `assets/${asset.path}`); card.append(image);
    }
    const label = document.createElement('span'); label.textContent = asset.path; card.append(label);
    card.addEventListener('click', () => {
      setAssetSelection(asset);
      const relative = `assets/${asset.path}`;
      if (state.selected?.confirmed) {
        if (state.selected.element.tagName !== 'IMG') return notify('当前元素已确认且不是图片，请先取消选择后再定位素材');
        replaceImageElementSource(state.selected.element, relative);
        return;
      }
      const image = findImageForAsset(asset);
      if (!image) return notify('这张素材当前页面没有使用；你可以先打开文件上传，或从画布选择一个图片位置');
      selectElement(image, false, false);
      notify('已在画布中显示并选中这张素材，右侧可以继续调整图片');
    });
    els.assetGrid.append(card);
  }
}

async function uploadImageAndReplace(file, element, { requireConfirmation = false } = {}) {
  if (!file) return;
  if (!element || element.tagName !== 'IMG') return notify('请先点击素材，或在画布中选择一个图片位置');
  if (requireConfirmation && !requireConfirmedSelection()) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const extension = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
      const relative = `assets/editor/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
      await api(`/api/project/asset?project=${encodeURIComponent(state.currentProject)}`, { method: 'POST', body: JSON.stringify({ path: relative, dataUrl: reader.result }) });
      replaceImageElementSource(element, relative, '图片已上传并替换，保存后写回项目');
      await loadAssets();
    } catch (error) { notify(error.message, 'error'); }
  };
  reader.readAsDataURL(file);
}

async function loadAssets() {
  if (!state.currentProject) return;
  try { state.assets = (await api(`/api/project/assets?project=${encodeURIComponent(state.currentProject)}`)).assets; renderAssets(); } catch (error) { notify(error.message, 'error'); }
}

async function loadProjects(preferredId = '') {
  const data = await api('/api/projects');
  state.projects = data.projects;
  els.projectSelect.replaceChildren();
  for (const project of state.projects) {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = `${project.name} · ${project.path}`;
    els.projectSelect.append(option);
  }
  if (!state.projects.length) throw new Error('还没有找到项目，请使用“浏览文件夹”选择一个包含 index.html 的文件夹');
  const next = state.projects.find((project) => project.id === preferredId) || state.projects[0];
  els.projectSelect.value = next.id;
  await loadProject(next.id);
}

function renderFolderBrowser(data) {
  state.folderBrowser = { path: data.path, parent: data.parent, selected: state.folderBrowser.selected && data.entries.some((entry) => entry.path === state.folderBrowser.selected) ? state.folderBrowser.selected : null };
  els.folderPath.value = data.path;
  els.folderUp.disabled = !data.parent;
  els.folderEntries.replaceChildren();
  if (!data.entries.length) {
    const empty = document.createElement('div'); empty.className = 'folder-empty'; empty.textContent = '当前目录没有可浏览的子文件夹。'; els.folderEntries.append(empty);
  }
  for (const entry of data.entries) {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'folder-entry'; row.setAttribute('role', 'option'); row.dataset.path = entry.path;
    const icon = document.createElement('span'); icon.className = 'folder-entry-icon'; icon.textContent = entry.hasIndex ? '▣' : '▱';
    const name = document.createElement('span'); name.className = 'folder-entry-name'; name.textContent = entry.name;
    const badge = document.createElement('span'); badge.className = 'folder-entry-badge'; badge.textContent = entry.hasIndex ? '项目 · index.html' : '打开';
    row.append(icon, name, badge);
    row.addEventListener('click', () => {
      if (entry.hasIndex) {
        state.folderBrowser.selected = entry.path;
        $$('.folder-entry', els.folderEntries).forEach((node) => node.classList.toggle('is-selected', node === row));
        els.openFolderProject.disabled = false;
        els.folderSelectionHint.textContent = `已选择：${entry.path}`;
      } else browseFolder(entry.path).catch((error) => notify(error.message, 'error'));
    });
    els.folderEntries.append(row);
  }
  if (!state.folderBrowser.selected) { els.openFolderProject.disabled = true; els.folderSelectionHint.textContent = '选择一个包含 index.html 的项目文件夹'; }
}

async function browseFolder(folderPath = '') {
  const query = folderPath ? `?path=${encodeURIComponent(folderPath)}` : '';
  renderFolderBrowser(await api(`/api/files/browse${query}`));
}

async function openFolderDialog() {
  state.folderBrowser = { path: null, parent: null, selected: null };
  els.folderDialog.showModal();
  try { await browseFolder(); } catch (error) { notify(error.message, 'error'); }
}

async function chooseFolderProject() {
  const folder = state.folderBrowser.selected;
  if (!folder) return;
  const result = await api('/api/projects/register', { method: 'POST', body: JSON.stringify({ path: folder }) });
  els.folderDialog.close();
  await loadProjects(result.project.id);
  notify(`已打开项目：${result.project.name}`);
}

async function loadPages(project) {
  const data = await api(`/api/project/pages?project=${encodeURIComponent(project)}`);
  state.pages = data.pages;
  els.pageSelect.replaceChildren();
  for (const page of state.pages) {
    const option = document.createElement('option');
    option.value = page.path;
    option.textContent = page.path;
    els.pageSelect.append(option);
  }
  state.currentPage = state.pages.find((page) => page.path === state.currentPage)?.path || state.pages[0]?.path || 'index.html';
  els.pageSelect.value = state.currentPage;
}

async function loadPage(page) {
  state.currentPage = page || 'index.html';
  els.pageSelect.value = state.currentPage;
  updateBrowserMock(state.projects.find((item) => item.id === state.currentProject)?.name || '', state.currentPage);
  state.selected = null; state.selectedAsset = null; state.dirty = false; state.history = []; state.historyIndex = -1;
  state.collapsedLayers.clear(); state.layersCollapsed = false;
  els.collapseLayers.textContent = '⌃';
  els.collapseLayers.title = '折叠全部图层';
  els.collapseLayers.setAttribute('aria-label', '折叠全部图层');
  updateHistoryButtons();
  els.saveSummary.textContent = '未保存';
  await loadAssets();
  const savedConfig = await api(`/api/project/config?project=${encodeURIComponent(state.currentProject)}&page=${encodeURIComponent(state.currentPage)}`);
  state.scenes = Array.isArray(savedConfig.config?.scenes) ? savedConfig.config.scenes : [];
  state.currentSceneId = null;
  renderScenes();
  const loaded = await api(`/api/project/html?project=${encodeURIComponent(state.currentProject)}&page=${encodeURIComponent(state.currentPage)}`);
  const onload = () => { els.preview.removeEventListener('load', onload); setupFrame(); };
  els.preview.addEventListener('load', onload);
  els.preview.src = `${projectUrl(state.currentProject, state.currentPage)}?editor=${Date.now()}`;
  state.loadedHtml = loaded.html;
  requestAnimationFrame(() => fitCanvas());
}

async function loadProject(project) {
  state.testPreview = false;
  els.testPreviewButton.textContent = '测试预览';
  els.testPreviewButton.classList.remove('is-active');
  els.frameBadge.textContent = '编辑模式';
  state.currentProject = project;
  const metadata = state.projects.find((item) => item.id === project);
  els.projectTitle.textContent = metadata?.name || project;
  updateBrowserMock(metadata?.name || project, state.currentPage);
  els.connectionStatus.textContent = `已连接 · ${metadata?.name || project}`;
  state.currentPage = 'index.html';
  await loadPages(project);
  await loadPage(state.currentPage);
}

async function saveProject() {
  if (!state.currentProject || !state.doc) return;
  const html = serializeDocument();
  await api(`/api/project/html?project=${encodeURIComponent(state.currentProject)}&page=${encodeURIComponent(state.currentPage)}`, { method: 'POST', body: JSON.stringify({ html }) });
  const elements = {};
  $$('[data-vse-trigger]', state.doc).forEach((element) => { elements[selectorFor(element)] = { trigger: triggerData(element) }; });
  await api(`/api/project/config?project=${encodeURIComponent(state.currentProject)}&page=${encodeURIComponent(state.currentPage)}`, { method: 'POST', body: JSON.stringify({ config: { version: 1, updatedAt: new Date().toISOString(), page: state.currentPage, elements, scenes: state.scenes } }) });
  state.dirty = false; els.saveSummary.textContent = '已保存'; notify('已保存到当前项目');
}

function updateFrameHeight() {
  if (!state.doc?.body) return;
  const height = state.device.height;
  els.preview.style.height = `${height}px`;
  els.frameWrap.style.minHeight = `${height + 72}px`;
}

function fitCanvas() {
  const available = els.canvasStage.clientWidth - 80;
  const width = Number(els.viewportWidth.value) || 1280;
  const scale = Math.min(1, Math.max(.32, available / width));
  els.frameWrap.style.width = `${width}px`;
  els.frameWrap.style.transform = `scale(${scale})`;
  els.frameWrap.style.marginBottom = `${-(1 - scale) * (state.device.height + 72)}px`;
  els.frameWrap.style.marginLeft = 'auto';
  els.frameWrap.style.marginRight = 'auto';
}

function applyDevicePreset(key, { customWidth = null, customHeight = null } = {}) {
  const preset = DEVICE_PRESETS[key] || DEVICE_PRESETS.custom;
  const width = key === 'custom' ? Math.max(320, Math.min(2400, Number(customWidth || els.viewportWidth.value) || preset.width)) : preset.width;
  const height = key === 'custom' ? Math.max(240, Math.min(1800, Number(customHeight || els.viewportHeight.value) || preset.height)) : preset.height;
  state.device = { key, width, height, label: preset.label };
  els.devicePreset.value = key;
  els.viewportWidth.value = width;
  els.viewportHeight.value = height;
  els.frameWrap.dataset.device = key;
  els.frameWrap.style.width = `${width}px`;
  updateFrameHeight();
  fitCanvas();
  updateSelectionHud();
}

function updateBrowserMock(projectName = '', page = state.currentPage) {
  const title = projectName || '页面预览';
  els.browserTabTitle.textContent = title.length > 24 ? `${title.slice(0, 23)}…` : title;
  els.browserAddressText.textContent = `${title}  /  ${page || 'index.html'}`;
  els.browserTabTitle.title = title;
  els.browserAddressText.title = `${title} / ${page || 'index.html'}`;
}

function renderScenes() {
  els.sceneCount.textContent = state.scenes.length;
  els.sceneList.replaceChildren();
  if (!state.scenes.length) {
    const empty = document.createElement('div');
    empty.className = 'scene-empty';
    empty.textContent = '还没有保存场景。右键操作页面后，在这里捕获当前状态。';
    els.sceneList.append(empty);
    return;
  }
  for (const scene of state.scenes) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `scene-card${scene.id === state.currentSceneId ? ' is-active' : ''}`;
    const deviceLabel = scene.device?.label || '当前设备';
    card.innerHTML = `<div class="scene-card-head"><strong></strong><span>${deviceLabel}</span></div><div class="scene-card-meta"></div>`;
    card.querySelector('strong').textContent = scene.name;
    card.querySelector('.scene-card-meta').textContent = `${scene.page || state.currentPage} · ${scene.device?.width || 0} × ${scene.device?.height || 0}`;
    card.addEventListener('click', () => restoreScene(scene));
    els.sceneList.append(card);
  }
}

function captureScene() {
  if (!state.doc?.documentElement) return notify('页面还没有加载完成');
  const fallbackName = `场景 ${state.scenes.length + 1}`;
  const name = els.sceneName.value.trim() || fallbackName;
  const scene = {
    id: `scene_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name,
    page: state.currentPage,
    createdAt: new Date().toISOString(),
    device: { ...state.device },
    html: serializeDocument(),
  };
  state.scenes = [...state.scenes, scene];
  state.currentSceneId = scene.id;
  els.sceneName.value = '';
  renderScenes();
  state.dirty = true;
  els.saveSummary.textContent = '有未保存修改';
  notify(`已捕获场景：${name}`);
}

function restoreScene(scene) {
  if (!scene?.html) return;
  if (state.dirty && !window.confirm('恢复场景会替换当前画布状态，未保存修改仍可通过撤销返回。继续吗？')) return;
  const current = state.doc?.documentElement ? serializeDocument() : '';
  state.history = state.history.slice(0, state.historyIndex + 1);
  if (current && state.history[state.history.length - 1] !== current) state.history.push(current);
  if (state.history[state.history.length - 1] !== scene.html) state.history.push(scene.html);
  state.historyIndex = state.history.length - 1;
  state.currentSceneId = scene.id;
  if (scene.device?.key) applyDevicePreset(scene.device.key, { customWidth: scene.device.width, customHeight: scene.device.height });
  state.testPreview = false;
  els.testPreviewButton.textContent = '测试预览';
  els.testPreviewButton.classList.remove('is-active');
  els.frameBadge.textContent = '编辑模式';
  restoreHtml(scene.html);
  renderScenes();
  state.dirty = true;
  els.saveSummary.textContent = '有未保存修改';
  updateHistoryButtons();
  notify(`已恢复场景：${scene.name}`);
}

function aiStatus(message, kind = '') {
  if (els.aiStatus) {
    els.aiStatus.textContent = message;
    els.aiStatus.dataset.kind = kind;
  } else if (message) notify(message, kind === 'error' ? 'error' : 'info');
}

function elementContext(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    selector: selectorFor(element),
    tag: element.tagName.toLowerCase(),
    text: directText(element),
    html: element.outerHTML,
    attributes: Object.fromEntries([...element.attributes].map((attribute) => [attribute.name, attribute.value])),
    computed: { left: computedStyleFor(element, 'left'), top: computedStyleFor(element, 'top'), width: computedStyleFor(element, 'width'), height: computedStyleFor(element, 'height'), display: computedStyleFor(element, 'display'), position: computedStyleFor(element, 'position') },
    rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    trigger: triggerData(element),
    nativeInteraction: nativeInteraction(element),
  };
}

function computedStyleFor(element, property) {
  return element?.style?.[property] || state.doc?.defaultView?.getComputedStyle(element)?.[property] || '';
}

async function buildAiContext({ scope = 'page', prompt = els.agentInput?.value?.trim() || '' } = {}) {
  const metadata = state.projects.find((item) => item.id === state.currentProject);
  const context = {
    schemaVersion: 1,
    source: '视图作文可视化编辑器',
    scope,
    project: { id: state.currentProject, name: metadata?.name || state.currentProject, path: metadata?.path || '' },
    page: state.currentPage,
    device: state.device,
    prompt,
    focus: state.selected?.element ? { selector: selectorFor(state.selected.element), confirmed: Boolean(state.selected.confirmed), label: elementLabel(state.selected.element) } : null,
    selection: elementContext(state.selected?.element),
    currentScene: state.scenes.find((scene) => scene.id === state.currentSceneId) || null,
    availableScenes: state.scenes.map(({ id, name, page, device, createdAt }) => ({ id, name, page, device, createdAt })),
  };
  if (scope === 'selection') return context;
  if (scope === 'scene') {
    context.sceneHtml = context.currentScene?.html || serializeDocument();
    return context;
  }
  context.html = serializeDocument();
  if (state.currentProject) {
    try {
      const files = await api(`/api/project/files?project=${encodeURIComponent(state.currentProject)}&content=1`);
      const sourceFiles = (files.files || []).filter((file) => file.text && typeof file.content === 'string');
      const priority = (file) => file.path === state.currentPage ? 0 : /^(css|js|src|data)\//i.test(file.path) ? 1 : file.path.includes('/') ? 2 : 1;
      let sourceBytes = 0;
      context.sourceFiles = sourceFiles.sort((a, b) => priority(a) - priority(b) || a.path.localeCompare(b.path)).flatMap(({ path, content, size, type }) => {
        if (sourceBytes + content.length > 480_000) return [];
        sourceBytes += content.length;
        return [{ path, content, size, type }];
      });
      context.sourceFileNote = `sourceFiles 是项目中可编辑的文本源码（本轮最多带入约 480 KB，当前已带入 ${sourceBytes} 字符）；不包含密钥、凭据和二进制文件。需要修改未列出的源码时可使用对应 path 的 read/write/patchFile 操作。`;
    } catch { context.sourceFiles = []; }
  }
  if (scope === 'project' && state.currentProject) {
    const pages = await api(`/api/project/pages?project=${encodeURIComponent(state.currentProject)}`);
    context.pages = [];
    for (const page of pages.pages || []) {
      const loaded = await api(`/api/project/html?project=${encodeURIComponent(state.currentProject)}&page=${encodeURIComponent(page.path)}`);
      context.pages.push({ path: page.path, html: loaded.html });
    }
    context.assets = state.assets;
  }
  return context;
}

function updateAiTarget() {
  if (!els.aiTarget) return;
  const selected = state.selected?.element;
  if (!selected) { els.aiTarget.textContent = '当前焦点：尚未选择组件'; return; }
  const meta = elementLabel(selected);
  els.aiTarget.textContent = `当前焦点：${selectorFor(selected)} · ${meta.text || meta.tag} · ${state.selected.confirmed ? '已确认' : '待确认'}`;
  els.aiTarget.title = `AI 会把 ${selectorFor(selected)} 作为精细修改焦点；范围仍可切换到页面或整个项目。`;
}

function renderAgentMessages(messages = []) {
  els.agentMessages.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement('div'); empty.className = 'agent-empty'; empty.textContent = '还没有对话。告诉 Agent 你想调整什么。'; els.agentMessages.append(empty); return;
  }
  for (const message of messages) {
    const row = document.createElement('div');
    row.className = `agent-message ${message.role === 'assistant' ? 'is-agent' : 'is-user'}`;
    const label = document.createElement('span'); label.className = 'agent-message-role'; label.textContent = message.role === 'assistant' ? 'Agent' : '你';
    const body = document.createElement('div'); body.className = 'agent-message-body';
    let text = Array.isArray(message.content) ? message.content.map((block) => typeof block === 'string' ? block : block?.text || block?.content || '').join('\n') : String(message.content || '');
    if (message.role === 'user') text = text.split('\n\n[编辑器当前上下文]')[0];
    else {
      try {
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        const parsed = JSON.parse(fenced?.[1] || text);
        text = parsed.reply || text;
      } catch { /* plain assistant text */ }
    }
    body.textContent = text;
    row.append(label, body);
    if (message.role === 'assistant' && Array.isArray(message.trace) && message.trace.length) {
      const trace = document.createElement('details'); trace.className = 'agent-trace';
      const summary = document.createElement('summary'); summary.textContent = '查看工作记录'; trace.append(summary);
      const list = document.createElement('ol');
      for (const item of message.trace) {
        const entry = document.createElement('li');
        const name = document.createElement('strong'); name.textContent = item.label || '步骤';
        const detail = document.createElement('span'); detail.textContent = item.detail || '';
        entry.append(name, detail); list.append(entry);
      }
      trace.append(list); row.append(trace);
    }
    els.agentMessages.append(row);
  }
  els.agentMessages.scrollTop = els.agentMessages.scrollHeight;
  if (state.agentPendingOperations.length) renderAgentPending();
}

function renderAgentPending() {
  const card = document.createElement('div'); card.className = 'agent-pending';
  const fileCount = state.agentPendingOperations.filter((operation) => ['writeFile', 'replaceFile', 'patchFile', 'deleteFile'].includes(operation?.op || operation?.type)).length;
  const text = document.createElement('div'); text.textContent = fileCount ? `工具调用：apply_project_changeset · Agent 提出了 ${state.agentPendingOperations.length} 个修改，其中 ${fileCount} 个会写入项目源码。确认后应用。` : `工具调用：页面 changeset · Agent 提出了 ${state.agentPendingOperations.length} 个页面修改。确认后会作为一个可撤销步骤应用。`;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'primary-button'; button.textContent = '确认应用修改'; button.addEventListener('click', () => applyAgentOperations(state.agentPendingOperations));
  card.append(text, button); els.agentMessages.append(card); els.agentMessages.scrollTop = els.agentMessages.scrollHeight;
}

async function loadAgentConfig() {
  try {
    const data = await api('/api/agent/config');
    if (data.agent?.provider) els.agentProvider.value = data.agent.provider;
    if (data.agent?.model) els.agentModel.value = data.agent.model;
    if (data.agent?.apiUrl) els.agentApiUrl.value = data.agent.apiUrl;
    els.agentConnection.textContent = data.agent?.configured ? `${data.agent.provider} · 已连接` : '待配置密钥';
    els.agentConnection.dataset.kind = data.agent?.configured ? 'success' : 'warning';
  } catch { els.agentConnection.textContent = '不可用'; }
}

async function loadAgentSessions(preferred = state.agentSessionId) {
  try {
    const data = await api('/api/agent/sessions');
    const sessions = data.sessions || [];
    els.agentSession.replaceChildren();
    const fresh = document.createElement('option'); fresh.value = ''; fresh.textContent = '新会话'; els.agentSession.append(fresh);
    for (const session of sessions) {
      const option = document.createElement('option'); option.value = session.id; option.textContent = `${session.title || '未命名会话'} · ${session.messageCount || 0} 条`;
      els.agentSession.append(option);
    }
    state.agentSessionId = sessions.some((session) => session.id === preferred) ? preferred : (sessions[0]?.id || '');
    els.agentSession.value = state.agentSessionId;
    if (state.agentSessionId) await loadAgentSession(state.agentSessionId);
    else renderAgentMessages([]);
  } catch (error) { aiStatus(`会话列表不可用：${error.message}`, 'error'); }
}

async function loadAgentSession(id) {
  if (!id) return renderAgentMessages([]);
  try { const session = await api(`/api/agent/session?id=${encodeURIComponent(id)}`); state.agentSessionId = session.id; renderAgentMessages(session.messages || []); } catch (error) { aiStatus(error.message, 'error'); }
}

function newAgentSession() {
  state.agentSessionId = '';
  state.agentPendingOperations = [];
  els.agentSession.value = '';
  renderAgentMessages([]);
  aiStatus('已开始新会话；选择的页面上下文仍会随每轮消息发送。');
}

async function saveAgentSettings() {
  try {
    const result = await api('/api/agent/config', { method: 'POST', body: JSON.stringify({ provider: els.agentProvider.value.trim(), model: els.agentModel.value.trim(), apiUrl: els.agentApiUrl.value.trim(), apiKey: els.agentApiKey.value.trim() }) });
    els.agentApiKey.value = '';
    els.agentConnection.textContent = result.agent?.configured ? `${result.agent.provider} · 已连接` : '待配置密钥';
    aiStatus('Agent 设置已保存。', 'success');
  } catch (error) { aiStatus(error.message || '保存 Agent 设置失败', 'error'); }
}

async function testAgentConnection() {
  const button = els.testAgentConnection;
  button.disabled = true; button.textContent = '测试中…';
  try {
    const result = await api('/api/agent/test', { method: 'POST', body: JSON.stringify({ provider: els.agentProvider.value.trim(), model: els.agentModel.value.trim(), apiUrl: els.agentApiUrl.value.trim(), apiKey: els.agentApiKey.value.trim() }) });
    els.agentConnection.textContent = `${result.provider} · 连接正常`;
    aiStatus(`连接测试成功：${result.reply || '模型已响应'}`, 'success');
  } catch (error) { aiStatus(`连接测试失败：${error.message}`, 'error'); }
  finally { button.disabled = false; button.textContent = '测试连接'; }
}

async function resetCurrentAgentSession() {
  if (!state.agentSessionId) return newAgentSession();
  if (!window.confirm('确定清空当前 Agent 会话吗？')) return;
  try { await api(`/api/agent/session?id=${encodeURIComponent(state.agentSessionId)}`, { method: 'DELETE' }); newAgentSession(); aiStatus('当前会话已清空。', 'success'); } catch (error) { aiStatus(error.message, 'error'); }
}

async function sendAgentMessage() {
  const message = els.agentInput.value.trim();
  if (!message || state.agentBusy) return;
  state.agentBusy = true; els.sendAgentMessage.disabled = true; els.sendAgentMessage.textContent = 'Agent 思考中…';
  try {
    const scope = /全局|整个项目|所有页面|每个页面|所有组件/.test(message) ? 'project' : 'page';
    const context = await buildAiContext({ scope, prompt: message });
    const result = await api('/api/agent/chat', { method: 'POST', body: JSON.stringify({ id: state.agentSessionId, message, context, project: state.currentProject, page: state.currentPage, title: message.slice(0, 32) }) });
    state.agentSessionId = result.sessionId;
    els.agentInput.value = '';
    state.agentPendingOperations = Array.isArray(result.operations) ? result.operations : [];
    if (state.agentPendingOperations.length) aiStatus(`Agent 返回了 ${state.agentPendingOperations.length} 个修改操作，请在对话中确认应用。`, 'success');
    else aiStatus('Agent 已回复，可以继续对话。', 'success');
    await loadAgentSessions(state.agentSessionId);
  } catch (error) { aiStatus(error.message || 'Agent 请求失败', 'error'); }
  finally { state.agentBusy = false; els.sendAgentMessage.disabled = false; els.sendAgentMessage.textContent = '发送给内置 Agent'; }
}

async function applyAgentOperations(operations) {
  if (!Array.isArray(operations) || !operations.length) return;
  const fileKinds = new Set(['writeFile', 'replaceFile', 'patchFile', 'deleteFile']);
  const fileOperations = operations.filter((operation) => fileKinds.has(operation?.op || operation?.type));
  const pageOperations = operations.filter((operation) => !fileKinds.has(operation?.op || operation?.type));
  const invalid = pageOperations.find((operation) => !operation || typeof operation.selector !== 'string' || !elementFromSelector(operation.selector));
  if (invalid) return aiStatus(`找不到元素：${invalid.selector || '未提供 selector'}`, 'error');
  if (!window.confirm(`AI 修改集将应用 ${operations.length} 个操作${fileOperations.length ? `，其中 ${fileOperations.length} 个会直接写入项目源码` : ''}。确定应用吗？`)) return;
  const before = serializeDocument();
  try {
    if (fileOperations.length) {
      await api(`/api/project/changeset?project=${encodeURIComponent(state.currentProject)}&page=${encodeURIComponent(state.currentPage)}`, { method: 'POST', body: JSON.stringify({ operations: fileOperations }) });
    }
    for (const operation of pageOperations) {
      const element = elementFromSelector(operation.selector);
      if (!element) throw new Error(`找不到元素：${operation.selector}`);
      const kind = operation.op || operation.type || 'update';
      if (kind === 'delete') { if (element === state.doc.body || element === state.doc.documentElement) throw new Error('不能删除页面根节点'); element.remove(); continue; }
      if (kind === 'replaceHtml') { element.outerHTML = operation.html; continue; }
      if (kind === 'replaceImage') { element.setAttribute('src', operation.src); if (operation.alt !== undefined) element.setAttribute('alt', operation.alt); continue; }
      if (operation.text !== undefined) element.textContent = String(operation.text);
      for (const [name, value] of Object.entries(operation.styles || {})) element.style.setProperty(name, String(value));
      for (const [name, value] of Object.entries(operation.attributes || {})) { if (value === null || value === '') element.removeAttribute(name); else element.setAttribute(name, String(value)); }
      if (operation.trigger !== undefined) { if (operation.trigger === null) element.removeAttribute('data-vse-trigger'); else element.setAttribute('data-vse-trigger', JSON.stringify(operation.trigger)); }
    }
    if (pageOperations.length) commitHistory();
    const html = serializeDocument();
    const currentPageTouched = fileOperations.some((operation) => String(operation.path || operation.file || '').replaceAll('\\', '/') === state.currentPage);
    if (currentPageTouched && !pageOperations.length) await loadPage(state.currentPage);
    else if (pageOperations.length || fileOperations.length) restoreHtml(html);
    state.agentPendingOperations = [];
    els.agentMessages.querySelector('.agent-pending')?.remove();
    if (fileOperations.length) { state.dirty = true; els.saveSummary.textContent = '源码已写入项目'; }
    aiStatus(`已应用 ${operations.length} 个操作。${fileOperations.length ? '项目源码已更新。' : '它们已合并为一个撤销步骤，保存按钮可写回项目。'}`, 'success');
    notify(fileOperations.length ? 'AI 已修改项目源码' : 'AI 修改已应用，可使用撤销一步回退');
  } catch (error) {
    if (before) restoreHtml(before);
    aiStatus(error.message || '应用 AI 修改失败', 'error');
  }
}

function initRangeDrag() {
  for (const handle of [$('#rangeStartHandle'), $('#rangeEndHandle')]) {
    handle.addEventListener('pointerdown', (event) => { state.rangeDragging = handle === $('#rangeStartHandle') ? 'start' : 'end'; handle.setPointerCapture(event.pointerId); });
    handle.addEventListener('pointermove', (event) => {
      if (!state.rangeDragging) return;
      const rect = handle.parentElement.getBoundingClientRect();
      let value = Math.round(((event.clientX - rect.left) / rect.width) * 100);
      value = Math.max(0, Math.min(100, value));
      if (state.rangeDragging === 'start') $('#triggerStart').value = Math.min(value, Number($('#triggerEnd').value));
      else $('#triggerEnd').value = Math.max(value, Number($('#triggerStart').value));
      renderTriggerControls();
    });
    handle.addEventListener('pointerup', () => { if (state.rangeDragging) { state.rangeDragging = null; writeTrigger(); } });
  }
}

function bindEvents() {
  applyDevicePreset('desktop');
  els.projectSelect.addEventListener('change', () => loadProject(els.projectSelect.value).catch((error) => notify(error.message, 'error')));
  els.pageSelect.addEventListener('change', () => loadPage(els.pageSelect.value).catch((error) => notify(error.message, 'error')));
  els.browseProjects.addEventListener('click', () => openFolderDialog());
  els.folderUp.addEventListener('click', () => { if (state.folderBrowser.parent) browseFolder(state.folderBrowser.parent).catch((error) => notify(error.message, 'error')); });
  els.folderGo.addEventListener('click', () => browseFolder(els.folderPath.value.trim()).catch((error) => notify(error.message, 'error')));
  els.openFolderProject.addEventListener('click', () => chooseFolderProject().catch((error) => notify(error.message, 'error')));
  $('#reloadProject').addEventListener('click', () => loadPage(state.currentPage).catch((error) => notify(error.message, 'error')));
  $('#saveButton').addEventListener('click', () => saveProject().catch((error) => notify(error.message, 'error')));
  els.captureScene.addEventListener('click', captureScene);
  els.agentSettingsToggle.addEventListener('click', () => { els.agentSettings.open = !els.agentSettings.open; });
  els.agentSession.addEventListener('change', () => { state.agentPendingOperations = []; loadAgentSession(els.agentSession.value); });
  els.newAgentSession.addEventListener('click', newAgentSession);
  els.saveAgentSettings.addEventListener('click', saveAgentSettings);
  els.testAgentConnection.addEventListener('click', testAgentConnection);
  els.resetAgentSession.addEventListener('click', resetCurrentAgentSession);
  els.sendAgentMessage.addEventListener('click', sendAgentMessage);
  els.agentInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); sendAgentMessage(); } });
  $('#clearSelection').addEventListener('click', clearSelection);
  els.confirmSelection.addEventListener('click', confirmSelection);
  els.lockElement.addEventListener('click', toggleElementLock);
  els.deleteElement.addEventListener('click', deleteSelectedElement);
  els.snapTool.addEventListener('click', () => {
    state.snapEnabled = !state.snapEnabled;
    els.snapTool.classList.toggle('is-active', state.snapEnabled);
    els.snapTool.title = state.snapEnabled ? '磁吸已开启：拖动和缩放吸附到 8px 网格' : '磁吸已关闭：自由拖动和缩放';
    notify(state.snapEnabled ? '磁吸已开启（8px 网格）' : '磁吸已关闭');
  });
  els.testPreviewButton.addEventListener('click', toggleTestPreview);
  $('#undoButton').addEventListener('click', undoStep);
  $('#redoButton').addEventListener('click', redoStep);
  document.addEventListener('keydown', (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (!modifier || event.altKey) return;
    const target = event.target;
    const isTextEditing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
    if (isTextEditing && !['scaleInput', 'scaleRange'].includes(target.id)) return;
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redoStep();
      else undoStep();
    } else if (key === 'y') {
      event.preventDefault();
      redoStep();
    }
  });
  $('#layerSearch').addEventListener('input', renderLayers);
  els.collapseLayers.addEventListener('click', () => {
    state.layersCollapsed = !state.layersCollapsed;
    if (!state.layersCollapsed) state.collapsedLayers.clear();
    els.collapseLayers.textContent = state.layersCollapsed ? '⌄' : '⌃';
    els.collapseLayers.title = state.layersCollapsed ? '展开全部图层' : '折叠全部图层';
    els.collapseLayers.setAttribute('aria-label', els.collapseLayers.title);
    renderLayers();
  });
  $$('.nav-item').forEach((item) => item.addEventListener('click', () => {
    state.activePanel = item.dataset.panel;
    $$('.nav-item').forEach((node) => node.classList.toggle('is-active', node === item));
    $$('[data-section]').forEach((section) => section.classList.toggle('is-hidden', section.dataset.section !== state.activePanel));
  }));
  $$('[data-style]').forEach((input) => input.addEventListener('change', () => setStyle(input.dataset.style, input.value)));
  $('#scaleRange').addEventListener('input', () => setElementScale($('#scaleRange').value, { history: false }));
  $('#scaleRange').addEventListener('change', () => commitHistory());
  $('#scaleInput').addEventListener('change', () => setElementScale($('#scaleInput').value));
  $('#resetScale').addEventListener('click', () => setElementScale(100));
  $('#relativePosition').addEventListener('change', () => { if (requireConfirmedSelection()) { state.selected.element.style.position = $('#relativePosition').checked ? 'relative' : ''; commitHistory(); renderInspector(); } });
  $('#textContent').addEventListener('change', () => { if (requireConfirmedSelection()) { const textNodes = [...state.selected.element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE); if (textNodes.length) textNodes[0].textContent = $('#textContent').value; else state.selected.element.insertBefore(state.doc.createTextNode($('#textContent').value), state.selected.element.firstChild); commitHistory(); renderLayers(); } });
  $('#imageSrc').addEventListener('change', () => { if (requireConfirmedSelection() && state.selected.element.tagName === 'IMG') { state.selected.element.setAttribute('src', $('#imageSrc').value); commitHistory(); } });
  $('#imageUpload').addEventListener('change', (event) => uploadImageAndReplace(event.target.files?.[0], state.selected?.element, { requireConfirmation: true }));
  els.assetUpload.addEventListener('change', (event) => {
    const target = state.selected?.element?.tagName === 'IMG' ? state.selected.element : findImageForAsset(state.selectedAsset);
    uploadImageAndReplace(event.target.files?.[0], target);
    event.target.value = '';
  });
  $('#useSelectedAsset').addEventListener('click', () => { if (!requireConfirmedSelection()) return; $$('.nav-item').find((node) => node.dataset.panel === 'assets')?.click(); notify('请从左侧素材库选择图片'); });
  ['triggerType', 'triggerEffect', 'triggerStart', 'triggerEnd', 'triggerPadding'].forEach((id) => $(`#${id}`).addEventListener('change', () => writeTrigger()));
  els.devicePreset.addEventListener('change', () => applyDevicePreset(els.devicePreset.value));
  els.viewportWidth.addEventListener('change', () => applyDevicePreset('custom', { customWidth: els.viewportWidth.value, customHeight: els.viewportHeight.value }));
  els.viewportHeight.addEventListener('change', () => applyDevicePreset('custom', { customWidth: els.viewportWidth.value, customHeight: els.viewportHeight.value }));
  $('#fitTool').addEventListener('click', fitCanvas);
  document.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest?.('.resize-handle');
    if (!handle || !requireConfirmedSelection()) return;
    const selected = state.selected.element;
    const styles = state.doc.defaultView.getComputedStyle(selected);
    const rect = selected.getBoundingClientRect();
    state.resizeSession = {
      direction: handle.dataset.resize,
      startX: event.clientX,
      startY: event.clientY,
      width: Number.parseFloat(selected.style.width || styles.width) || rect.width,
      height: Number.parseFloat(selected.style.height || styles.height) || rect.height,
      left: Number.parseFloat(selected.style.left || styles.left) || 0,
      top: Number.parseFloat(selected.style.top || styles.top) || 0,
    };
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  document.addEventListener('pointermove', (event) => {
    const resize = state.resizeSession;
    if (!resize || !state.selected?.element) return;
    const scale = els.frameWrap.offsetWidth ? els.frameWrap.getBoundingClientRect().width / els.frameWrap.offsetWidth : 1;
    const dx = (event.clientX - resize.startX) / Math.max(scale, .1);
    const dy = (event.clientY - resize.startY) / Math.max(scale, .1);
    const direction = resize.direction;
    let width = resize.width;
    let height = resize.height;
    let left = resize.left;
    let top = resize.top;
    if (direction.includes('e')) width = Math.max(24, resize.width + dx);
    if (direction.includes('s')) height = Math.max(24, resize.height + dy);
    if (direction.includes('w')) { width = Math.max(24, resize.width - dx); left = resize.left + dx; }
    if (direction.includes('n')) { height = Math.max(24, resize.height - dy); top = resize.top + dy; }
    const selected = state.selected.element;
    selected.style.position = 'relative';
    selected.style.width = `${snapValue(width)}px`;
    selected.style.height = `${snapValue(height)}px`;
    if (direction.includes('w')) selected.style.left = `${snapValue(left)}px`;
    if (direction.includes('n')) selected.style.top = `${snapValue(top)}px`;
    renderInspector(); updateSelectionHud();
    event.preventDefault();
  });
  document.addEventListener('pointerup', () => { if (state.resizeSession) { state.resizeSession = null; commitHistory(); } });
  window.addEventListener('resize', () => { if (!els.frameWrap.style.transform || els.frameWrap.style.transform !== 'none') fitCanvas(); updateSelectionHud(); });
  els.preview.addEventListener('load', () => { setTimeout(() => { updateFrameHeight(); updateSelectionHud(); fitCanvas(); }, 40); });
  initRangeDrag();
}

async function boot() {
  bindEvents();
  requestAnimationFrame(() => fitCanvas());
  loadAgentConfig();
  loadAgentSessions();
  try {
    await loadProjects();
  } catch (error) {
    els.connectionStatus.textContent = '连接失败';
    notify(error.message, 'error');
  }
}

boot();
