const state = {
  index: null,
  files: [],
  filtered: [],
  staticFiles: [],
};

const els = {
  status: document.getElementById('status'),
  formatVersion: document.getElementById('formatVersion'),
  fileCount: document.getElementById('fileCount'),
  plainSize: document.getElementById('plainSize'),
  encryptedSize: document.getElementById('encryptedSize'),
  staticFileCount: document.getElementById('staticFileCount'),
  staticSize: document.getElementById('staticSize'),
  search: document.getElementById('search'),
  folderFilter: document.getElementById('folderFilter'),
  layoutFilter: document.getElementById('layoutFilter'),
  sortBy: document.getElementById('sortBy'),
  folderSummary: document.getElementById('folderSummary'),
  filesBody: document.getElementById('filesBody'),
  staticFilesBody: document.getElementById('staticFilesBody'),
  checkManifests: document.getElementById('checkManifests'),
};

function setStatus(text, tone = '') {
  els.status.textContent = text;
  els.status.dataset.tone = tone;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return '-';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toLocaleString(undefined, { maximumFractionDigits: unit ? 2 : 0 })} ${units[unit]}`;
}

function firstFolder(path) {
  return path.includes('/') ? path.slice(0, path.indexOf('/')) : '(root)';
}

function storageUrl(path) {
  return new URL(path, window.location.href).href;
}

function storageReferenceUrl(kind, logicalPath) {
  const storageId = encodeURIComponent(document.body.dataset.storageId || '');
  const path = logicalPath.split('/').map(encodeURIComponent).join('/');
  if (kind === 'static') {
    return `static://${storageId}/${path}`;
  }
  return `enc://${storageId}/${path}`;
}

function copyLinkButton(url) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-link-button';
  button.textContent = 'copy link';
  button.addEventListener('click', () => copyToClipboard(url, button));
  return button;
}

async function copyToClipboard(text, button) {
  const originalText = button.textContent;
  button.disabled = true;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopyToClipboard(text);
    }
    button.textContent = 'copied';
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 1400);
  } catch (error) {
    button.disabled = false;
    setStatus(`Could not copy link. ${error.message}`, 'warn');
  }
}

function fallbackCopyToClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  document.body.append(textarea);
  textarea.select();

  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) {
    throw new Error('clipboard copy failed');
  }
}

function formatTimestamp(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timestampValue(value) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function loadIndex() {
  try {
    state.index = await fetch('index.json', { cache: 'no-store' }).then((response) => {
      if (!response.ok) {
        throw new Error(`index.json returned HTTP ${response.status}`);
      }
      return response.json();
    });
  } catch (error) {
    setStatus(`index.json is not available yet. Run sync to publish storage metadata. ${error.message}`, 'warn');
    renderEmpty('index.json is not available yet.');
    return;
  }

  const entries = Object.entries(state.index.files || {});
  if (!entries.length) {
    state.files = [];
    updateOverview();
    setStatus('index.json loaded. No files are indexed yet.');
    render();
    return;
  }

  setStatus(`index.json loaded. Loading ${entries.length} manifests...`);
  state.files = await Promise.all(entries.map(loadFileRow));
  updateOverview();
  populateFolderFilter();
  setStatus(`Loaded ${state.files.length} file manifests.`);
  render();
}

async function loadStaticIndex() {
  try {
    const staticIndex = await fetchJson('static-index.json');
    state.staticFiles = Object.entries(staticIndex.files || {}).map(([logicalPath, entry]) => ({
      logicalPath,
      path: entry.path,
      mime: entry.mime || '-',
      addedAt: entry.addedAt,
      modifiedAt: entry.modifiedAt,
      size: entry.size || 0,
      digest: entry.digest || '-',
    }));
  } catch {
    state.staticFiles = [];
    updateStaticOverview();
    renderStaticEmpty('static-index.json is not available yet.');
    return;
  }

  updateStaticOverview();
  renderStatic();
}

async function loadFileRow([logicalPath, indexEntry]) {
  const manifestPath = indexEntry.manifest;
  try {
    const manifest = await fetchJson(manifestPath);
    const layout = manifest.layout || {};
    const chunks = layout.kind === 'chunked' ? layout.chunks || [] : [];
    return {
      ok: true,
      logicalPath,
      manifestPath,
      manifest,
      mime: manifest.mime || '-',
      layout: layout.kind || '-',
      addedAt: manifest.addedAt,
      modifiedAt: manifest.modifiedAt,
      plaintextSize: manifest.plaintextSize,
      encryptedSize: manifest.encryptedSize,
      chunks,
      folder: firstFolder(logicalPath),
    };
  } catch (error) {
    return {
      ok: false,
      logicalPath,
      manifestPath,
      mime: '-',
      layout: '-',
      addedAt: '',
      modifiedAt: '',
      plaintextSize: 0,
      encryptedSize: 0,
      chunks: [],
      folder: firstFolder(logicalPath),
      error,
    };
  }
}

function updateOverview() {
  const plain = state.files.reduce((sum, file) => sum + (file.plaintextSize || 0), 0);
  const encrypted = state.files.reduce((sum, file) => sum + (file.encryptedSize || 0), 0);
  els.formatVersion.textContent = state.index?.version ?? '-';
  els.fileCount.textContent = state.files.length.toLocaleString();
  els.plainSize.textContent = formatBytes(plain);
  els.encryptedSize.textContent = formatBytes(encrypted);
}

function updateStaticOverview() {
  const size = state.staticFiles.reduce((sum, file) => sum + (file.size || 0), 0);
  els.staticFileCount.textContent = state.staticFiles.length.toLocaleString();
  els.staticSize.textContent = formatBytes(size);
}

function populateFolderFilter() {
  const folders = [...new Set(state.files.map((file) => file.folder))].sort();
  for (const folder of folders) {
    const option = document.createElement('option');
    option.value = folder;
    option.textContent = folder;
    els.folderFilter.appendChild(option);
  }
  els.folderSummary.replaceChildren(...folders.map((folder) => {
    const count = state.files.filter((file) => file.folder === folder).length;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `${folder}: ${count}`;
    return chip;
  }));
}

function applyFilters() {
  const query = els.search.value.trim().toLowerCase();
  const folder = els.folderFilter.value;
  const layout = els.layoutFilter.value;
  const sortBy = els.sortBy.value;
  state.filtered = state.files.filter((file) => {
    if (query && !file.logicalPath.toLowerCase().includes(query)) return false;
    if (folder && file.folder !== folder) return false;
    if (layout && file.layout !== layout) return false;
    return true;
  });

  state.filtered.sort((left, right) => {
    if (sortBy === 'added') return timestampValue(right.addedAt) - timestampValue(left.addedAt);
    if (sortBy === 'modified') return timestampValue(right.modifiedAt) - timestampValue(left.modifiedAt);
    if (sortBy === 'plain') return (right.plaintextSize || 0) - (left.plaintextSize || 0);
    if (sortBy === 'encrypted') return (right.encryptedSize || 0) - (left.encryptedSize || 0);
    if (sortBy === 'mime') return String(left.mime).localeCompare(String(right.mime));
    return left.logicalPath.localeCompare(right.logicalPath);
  });
}

function sortedStaticFiles() {
  const sortBy = els.sortBy.value;
  return [...state.staticFiles].sort((left, right) => {
    if (sortBy === 'added') return timestampValue(right.addedAt) - timestampValue(left.addedAt);
    if (sortBy === 'modified') return timestampValue(right.modifiedAt) - timestampValue(left.modifiedAt);
    if (sortBy === 'mime') return String(left.mime).localeCompare(String(right.mime));
    return left.logicalPath.localeCompare(right.logicalPath);
  });
}

function render() {
  applyFilters();
  if (!state.filtered.length) {
    renderEmpty(state.files.length ? 'No files match the current filters.' : 'No files indexed yet.');
    return;
  }

  els.filesBody.replaceChildren(...state.filtered.map((file) => {
    const row = document.createElement('tr');
    row.append(
      cell(file.logicalPath, 'path'),
      cell(file.mime),
      cell(file.layout),
      cell(formatTimestamp(file.addedAt), 'details'),
      cell(formatTimestamp(file.modifiedAt), 'details'),
      cell(formatBytes(file.plaintextSize)),
      cell(formatBytes(file.encryptedSize)),
      cell(file.chunks.length ? String(file.chunks.length) : '-'),
      linksCell(file),
    );
    return row;
  }));
}

function renderStatic() {
  if (!state.staticFiles.length) {
    renderStaticEmpty('No static files indexed yet.');
    return;
  }

  els.staticFilesBody.replaceChildren(...sortedStaticFiles().map((file) => {
    const row = document.createElement('tr');
    row.append(
      cell(file.logicalPath, 'path'),
      cell(file.mime),
      cell(formatTimestamp(file.addedAt), 'details'),
      cell(formatTimestamp(file.modifiedAt), 'details'),
      cell(formatBytes(file.size)),
      cell(file.digest, 'details'),
      staticLinksCell(file),
    );
    return row;
  }));
}

function renderEmpty(message) {
  const row = document.createElement('tr');
  const td = document.createElement('td');
  td.className = 'empty';
  td.colSpan = 9;
  td.textContent = message;
  row.append(td);
  els.filesBody.replaceChildren(row);
}

function renderStaticEmpty(message) {
  const row = document.createElement('tr');
  const td = document.createElement('td');
  td.className = 'empty';
  td.colSpan = 7;
  td.textContent = message;
  row.append(td);
  els.staticFilesBody.replaceChildren(row);
}

function cell(text, className = '') {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text ?? '-';
  return td;
}

function linksCell(file) {
  const td = document.createElement('td');
  td.className = 'details';
  const manifest = document.createElement('a');
  manifest.href = storageUrl(file.manifestPath);
  manifest.textContent = 'manifest';
  td.append(manifest);

  if (file.ok && file.manifest?.layout?.kind === 'single') {
    td.append(' | ');
    const object = document.createElement('a');
    object.href = storageUrl(file.manifest.layout.object);
    object.textContent = 'object';
    td.append(object);
  } else if (file.ok && file.chunks.length) {
    td.append(` | ${file.chunks.length} chunk objects`);
  } else if (file.error) {
    td.append(` | ${file.error.message}`);
  }
  td.append(copyLinkButton(storageReferenceUrl('encrypted', file.logicalPath)));
  return td;
}

function staticLinksCell(file) {
  const td = document.createElement('td');
  const link = document.createElement('a');
  link.href = storageUrl(file.path);
  link.textContent = 'file';
  td.append(link, copyLinkButton(storageReferenceUrl('static', file.logicalPath)));
  return td;
}

async function checkManifests() {
  if (!state.index) {
    setStatus('index.json is not loaded.', 'warn');
    return;
  }
  const entries = Object.entries(state.index.files || {});
  let reachable = 0;
  for (const [, entry] of entries) {
    try {
      await fetchJson(entry.manifest);
      reachable += 1;
    } catch {
      // Count failures in the final status.
    }
  }
  const failed = entries.length - reachable;
  setStatus(`Manifest check complete: ${reachable} reachable, ${failed} failed.`, failed ? 'warn' : '');
}

for (const input of [els.search, els.folderFilter, els.layoutFilter, els.sortBy]) {
  input.addEventListener('input', () => {
    render();
    renderStatic();
  });
}
els.checkManifests.addEventListener('click', checkManifests);

async function loadPage() {
  await loadIndex();
  await loadStaticIndex();
}

loadPage();
