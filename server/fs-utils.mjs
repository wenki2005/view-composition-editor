import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

export const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const driveRoot = path.parse(editorRoot).root;
const defaultWorkspaceRoot = path.join(driveRoot, '视图作文');
const workspaceStateFile = path.join(editorRoot, 'data', 'workspaces.json');
const excludedFolders = new Set(['.git', '.hg', '.svn', 'node_modules', '$RECYCLE.BIN', 'System Volume Information']);
const excludedFileNames = new Set(['.env', '.env.local', '.env.production', '.env.development', 'credentials.json', 'secrets.json']);
const textExtensions = new Set(['.html', '.htm', '.css', '.scss', '.sass', '.less', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.md', '.txt', '.xml', '.svg', '.vue', '.svelte', '.yaml', '.yml', '.toml', '.ini', '.map']);
const maxTextFileBytes = 2 * 1024 * 1024;

function normalizeAbsolutePath(value = driveRoot) {
  const resolved = path.resolve(String(value || driveRoot));
  if (!path.isAbsolute(resolved)) throw new Error('文件夹路径必须是绝对路径');
  return resolved;
}

export function projectIdFor(root) {
  return `p_${Buffer.from(normalizeAbsolutePath(root), 'utf8').toString('base64url')}`;
}

function pathFromProjectId(projectId) {
  if (!String(projectId).startsWith('p_')) return null;
  try { return normalizeAbsolutePath(Buffer.from(String(projectId).slice(2), 'base64url').toString('utf8')); } catch { return null; }
}

async function readWorkspaceRoots() {
  try {
    const data = JSON.parse(await fs.readFile(workspaceStateFile, 'utf8'));
    return Array.isArray(data.roots) ? data.roots.map(normalizeAbsolutePath) : [];
  } catch { return []; }
}

async function writeWorkspaceRoots(roots) {
  await fs.mkdir(path.dirname(workspaceStateFile), { recursive: true });
  await fs.writeFile(workspaceStateFile, `${JSON.stringify({ version: 1, roots: [...new Set(roots.map(normalizeAbsolutePath))] }, null, 2)}\n`, 'utf8');
}

async function findEntryHtml(root) {
  let entries = [];
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return null; }
  const htmlFiles = entries.filter((entry) => entry.isFile() && /\.html?$/i.test(entry.name)).map((entry) => entry.name).sort((a, b) => (a.toLowerCase() === 'index.html' ? -1 : b.toLowerCase() === 'index.html' ? 1 : a.localeCompare(b, 'zh-CN')));
  return htmlFiles[0] || null;
}

async function projectFromRoot(root) {
  const normalized = normalizeAbsolutePath(root);
  if (normalized === editorRoot) return null;
  const entryName = await findEntryHtml(normalized);
  if (!entryName) return null;
  const indexPath = path.join(normalized, entryName);
  try {
    const stat = await fs.stat(indexPath);
    if (!stat.isFile()) return null;
    return { id: projectIdFor(normalized), name: path.basename(normalized) || normalized, root: normalized, path: normalized, indexPath, entryPage: entryName, updatedAt: stat.mtime.toISOString(), size: stat.size };
  } catch { return null; }
}

function pageFile(project, pagePath = 'index.html') {
  const safe = safeRelativePath(pagePath || 'index.html');
  if (!/\.(html?|HTML?)$/.test(safe)) throw new Error('页面必须是 HTML 文件');
  const filePath = projectFile(project, safe);
  return { path: safe.replaceAll(path.sep, '/'), filePath };
}

export async function listPages(projectId) {
  const project = await getProject(projectId);
  const pages = [];
  async function walk(dir, prefix = '') {
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || excludedFolders.has(entry.name)) continue;
      const relative = path.posix.join(prefix, entry.name);
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (/\.html?$/i.test(entry.name)) { const stat = await fs.stat(absolute); pages.push({ path: relative, name: entry.name, updatedAt: stat.mtime.toISOString(), size: stat.size }); }
    }
  }
  await walk(project.root);
  return pages.sort((a, b) => (a.path === 'index.html' ? -1 : b.path === 'index.html' ? 1 : a.path.localeCompare(b.path, 'zh-CN')));
}

async function scanRoot(root, maxDepth = 3) {
  const found = [];
  async function walk(current, depth) {
    const project = await projectFromRoot(current);
    if (project) found.push(project);
    if (depth >= maxDepth || project) return;
    let entries;
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || excludedFolders.has(entry.name)) continue;
      await walk(path.join(current, entry.name), depth + 1);
    }
  }
  await walk(normalizeAbsolutePath(root), 0);
  return found;
}

export async function listProjects() {
  const roots = [defaultWorkspaceRoot, ...(await readWorkspaceRoots())];
  const all = (await Promise.all([...new Set(roots)].map((root) => scanRoot(root, 3)))).flat();
  const unique = new Map(all.map((project) => [project.id, project]));
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

export async function getProject(projectId) {
  const decoded = pathFromProjectId(projectId);
  if (decoded) {
    const project = await projectFromRoot(decoded);
    if (project) return project;
  }
  const projects = await listProjects();
  const project = projects.find((item) => item.id === projectId || item.name === projectId);
  if (!project) throw new Error(`找不到项目：${projectId}`);
  return project;
}

export async function browseDirectory(directoryPath = driveRoot) {
  const current = normalizeAbsolutePath(directoryPath);
  const stat = await fs.stat(current).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`文件夹不存在：${current}`);
  const entries = [];
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || excludedFolders.has(entry.name)) continue;
    const absolute = path.join(current, entry.name);
    const entryPage = await findEntryHtml(absolute);
    const hasPage = Boolean(entryPage);
    entries.push({ name: entry.name, path: absolute, hasIndex: hasPage, hasPage, entryPage });
  }
  entries.sort((a, b) => Number(b.hasPage) - Number(a.hasPage) || a.name.localeCompare(b.name, 'zh-CN'));
  const parent = path.dirname(current) === current ? null : path.dirname(current);
  const currentEntryPage = await findEntryHtml(current);
  return { path: current, parent, hasIndex: Boolean(currentEntryPage), hasPage: Boolean(currentEntryPage), entryPage: currentEntryPage, entries };
}

export async function registerProject(directoryPath) {
  const project = await projectFromRoot(directoryPath);
  if (!project) throw new Error('选择的文件夹中没有 HTML 页面。请进入包含 index.html、main.html 或其他 .html 文件的项目文件夹。');
  const roots = await readWorkspaceRoots();
  await writeWorkspaceRoots([...roots, project.root]);
  return project;
}

function safeRelativePath(relativePath = '') {
  const normalized = path.normalize(relativePath).replace(/^([/\\])+/, '');
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`) || path.isAbsolute(normalized)) throw new Error('非法文件路径');
  return normalized;
}

function isSensitiveProjectPath(relativePath) {
  const normalized = String(relativePath || '').replaceAll('\\', '/');
  const basename = path.posix.basename(normalized).toLowerCase();
  return excludedFileNames.has(basename) || /^\.env(?:\.|$)/i.test(basename) || /(?:secret|credential|token|private[-_]?key)/i.test(basename);
}

function isTextProjectPath(relativePath) {
  return textExtensions.has(path.extname(String(relativePath || '')).toLowerCase());
}

export function projectFile(project, relativePath) {
  const safe = safeRelativePath(relativePath);
  const filePath = path.resolve(project.root, safe);
  if (filePath !== project.root && !filePath.startsWith(`${project.root}${path.sep}`)) throw new Error('非法文件路径');
  return filePath;
}

export async function listProjectFiles(projectId, { includeContent = false, maxFiles = 500, maxTotalBytes = 2 * 1024 * 1024 } = {}) {
  const project = await getProject(projectId);
  const files = [];
  let totalBytes = 0;
  async function walk(dir, prefix = '') {
    if (files.length >= maxFiles) return;
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (files.length >= maxFiles || entry.name.startsWith('.') && entry.name !== '.visual-editor') continue;
      if (entry.isDirectory() && excludedFolders.has(entry.name)) continue;
      const relative = path.posix.join(prefix, entry.name);
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(absolute, relative); continue; }
      if (isSensitiveProjectPath(relative)) continue;
      const stat = await fs.stat(absolute).catch(() => null);
      if (!stat?.isFile()) continue;
      const item = { path: relative, size: stat.size, type: path.extname(entry.name).slice(1).toLowerCase(), text: isTextProjectPath(relative) };
      if (includeContent && item.text && stat.size <= maxTextFileBytes && totalBytes + stat.size <= maxTotalBytes) {
        item.content = await fs.readFile(absolute, 'utf8');
        totalBytes += stat.size;
      }
      files.push(item);
    }
  }
  await walk(project.root);
  return { project: project.id, root: project.root, files: files.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN')) };
}

export async function readProjectFile(projectId, relativePath, { maxBytes = maxTextFileBytes } = {}) {
  const project = await getProject(projectId);
  const safePath = safeRelativePath(relativePath);
  if (isSensitiveProjectPath(safePath)) throw new Error('出于安全原因不能读取密钥或凭据文件');
  const filePath = projectFile(project, safePath);
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error('目标不是文件');
  if (stat.size > maxBytes) throw new Error(`文件超过 ${Math.round(maxBytes / 1024 / 1024)} MB，请先缩小读取范围`);
  return { project: project.id, path: safePath.replaceAll(path.sep, '/'), content: await fs.readFile(filePath, 'utf8'), bytes: stat.size };
}

export async function writeProjectFile(projectId, relativePath, content) {
  const project = await getProject(projectId);
  const safePath = safeRelativePath(relativePath);
  if (isSensitiveProjectPath(safePath)) throw new Error('出于安全原因不能写入密钥或凭据文件');
  if (typeof content !== 'string') throw new Error('文件内容必须是文本');
  if (Buffer.byteLength(content, 'utf8') > maxTextFileBytes) throw new Error('单个文本文件不能超过 2 MB');
  const filePath = projectFile(project, safePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
  return { project: project.id, path: safePath.replaceAll(path.sep, '/'), bytes: Buffer.byteLength(content, 'utf8') };
}

export async function deleteProjectFile(projectId, relativePath) {
  const project = await getProject(projectId);
  const safePath = safeRelativePath(relativePath);
  if (isSensitiveProjectPath(safePath)) throw new Error('出于安全原因不能删除密钥或凭据文件');
  const filePath = projectFile(project, safePath);
  await fs.rm(filePath, { force: true });
  return { project: project.id, path: safePath.replaceAll(path.sep, '/'), deleted: true };
}

export async function applyProjectChangeset(projectId, operations, pagePath = 'index.html') {
  if (!Array.isArray(operations) || !operations.length) throw new Error('operations 必须是非空数组');
  if (operations.length > 100) throw new Error('一次最多应用 100 个操作');
  const fileResults = [];
  const pageOperations = [];
  for (const operation of operations) {
    const kind = operation?.op || operation?.type || 'update';
    if (['writeFile', 'replaceFile', 'patchFile', 'deleteFile'].includes(kind)) fileResults.push({ operation, kind });
    else pageOperations.push(operation);
  }
  const result = pageOperations.length ? await applyChangeset(projectId, pageOperations, pagePath) : { project: projectId, page: pagePath, applied: 0, bytes: 0 };
  const files = [];
  for (const { operation, kind } of fileResults) {
    const filePath = String(operation.path || operation.file || '');
    if (!filePath) throw new Error(`${kind} 缺少 path`);
    if (kind === 'deleteFile') files.push(await deleteProjectFile(projectId, filePath));
    else if (kind === 'patchFile') {
      const current = await readProjectFile(projectId, filePath);
      const find = String(operation.find ?? '');
      const replace = String(operation.replace ?? '');
      if (!find) throw new Error('patchFile 缺少 find');
      if (!current.content.includes(find)) throw new Error(`文件中找不到要替换的内容：${filePath}`);
      const next = operation.replaceAll ? current.content.split(find).join(replace) : current.content.replace(find, replace);
      files.push(await writeProjectFile(projectId, filePath, next));
    } else files.push(await writeProjectFile(projectId, filePath, String(operation.content ?? '')));
  }
  return { ...result, files, applied: pageOperations.length + fileResults.length };
}

export async function readProjectHtml(projectId, pagePath = 'index.html') {
  const project = await getProject(projectId);
  const page = pageFile(project, pagePath);
  return { project, page: page.path, html: await fs.readFile(page.filePath, 'utf8') };
}

export async function saveProjectHtml(projectId, html, pagePath = 'index.html') {
  const project = await getProject(projectId);
  const page = pageFile(project, pagePath);
  const cleanHtml = cleanEditorArtifacts(html);
  await fs.writeFile(page.filePath, cleanHtml, 'utf8');
  return { project, page: page.path, bytes: Buffer.byteLength(cleanHtml) };
}

export async function listAssets(projectId) {
  const project = await getProject(projectId);
  const assetsRoot = path.join(project.root, 'assets');
  const results = [];
  async function walk(dir, prefix = '') {
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = path.posix.join(prefix, entry.name);
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(absolute, rel);
      else { const stat = await fs.stat(absolute); results.push({ path: rel, url: `/site/${encodeURIComponent(project.id)}/assets/${rel.split('/').map(encodeURIComponent).join('/')}`, size: stat.size, type: path.extname(entry.name).slice(1).toLowerCase() }); }
    }
  }
  await walk(assetsRoot);
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

export async function saveAssetDataUrl(projectId, relativePath, dataUrl) {
  const project = await getProject(projectId);
  if (!/^data:[^;]+;base64,[A-Za-z0-9+/=\r\n]+$/.test(dataUrl)) throw new Error('只接受 base64 data URL');
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  const buffer = Buffer.from(match[2], 'base64');
  const target = projectFile(project, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
  return { path: safeRelativePath(relativePath), bytes: buffer.length, mime: match[1] };
}

export async function saveProjectConfig(projectId, config, pagePath = 'index.html') {
  const project = await getProject(projectId);
  const configDir = path.join(project.root, '.visual-editor');
  await fs.mkdir(configDir, { recursive: true });
  const file = pagePath === 'index.html' ? path.join(configDir, 'page-config.json') : path.join(configDir, `${pagePath.replace(/[^a-z0-9._-]+/gi, '_')}.json`);
  await fs.writeFile(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return { file, config };
}

export async function readProjectConfig(projectId, pagePath = 'index.html') {
  const project = await getProject(projectId);
  const file = pagePath === 'index.html' ? path.join(project.root, '.visual-editor', 'page-config.json') : path.join(project.root, '.visual-editor', `${pagePath.replace(/[^a-z0-9._-]+/gi, '_')}.json`);
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return { version: 1, elements: {} }; }
}

export function cleanEditorArtifacts(html) {
  const $ = load(html, { decodeEntities: false });
  $('[data-vse-editor-ui], #vse-editor-style, style[data-vse-editor-style]').remove();
  $('[data-vse-selected], [data-vse-hover], [data-vse-locked]').removeAttr('data-vse-selected data-vse-hover data-vse-locked');
  return $.html();
}

export function inspectHtml(html) {
  const $ = load(html, { decodeEntities: false });
  const elements = [];
  $('body *').each((index, node) => {
    const el = $(node); const tag = node.name;
    const text = el.clone().children().remove().end().text().replace(/\s+/g, ' ').trim().slice(0, 80);
    const id = el.attr('id') || ''; const classes = (el.attr('class') || '').split(/\s+/).filter(Boolean).slice(0, 4);
    const selector = id ? `#${id}` : `${tag}${classes.length ? `.${classes.join('.')}` : ''}`;
    elements.push({ index, tag, selector, id, classes, text, src: el.attr('src') || '', trigger: parseTrigger(el.attr('data-vse-trigger')) });
  });
  return { title: $('title').first().text().trim(), elements, images: $('img').map((_, node) => ({ src: $(node).attr('src') || '', alt: $(node).attr('alt') || '' })).get() };
}

export function parseTrigger(value) { if (!value) return null; try { return JSON.parse(value); } catch { return null; } }

export async function updateElement(projectId, selector, changes, pagePath = 'index.html') {
  const { html } = await readProjectHtml(projectId, pagePath); const $ = load(html, { decodeEntities: false }); const element = $(selector).first();
  if (!element.length) throw new Error(`找不到元素：${selector}`);
  if (changes.text !== undefined) element.text(changes.text);
  for (const [name, value] of Object.entries(changes.attributes || {})) { if (value === null || value === '') element.removeAttr(name); else element.attr(name, String(value)); }
  if (changes.styles && typeof changes.styles === 'object') { const style = parseInlineStyle(element.attr('style') || ''); Object.assign(style, changes.styles); element.attr('style', stringifyInlineStyle(style)); }
  if (changes.trigger !== undefined) { if (changes.trigger === null) element.removeAttr('data-vse-trigger'); else element.attr('data-vse-trigger', JSON.stringify(changes.trigger)); }
  const output = $.html(); await saveProjectHtml(projectId, output, pagePath); return { selector, changed: true, page: pagePath, html: output };
}

export async function getEditorContext(projectId, pagePath = 'index.html', scope = 'page', selector = '') {
  const { html } = await readProjectHtml(projectId, pagePath);
  const config = await readProjectConfig(projectId, pagePath);
  const context = { schemaVersion: 1, source: '可视化编辑器 MCP', project: projectId, page: pagePath, scope, selector: selector || null, html, config, inspection: inspectHtml(html) };
  const sourceFiles = await listProjectFiles(projectId, { includeContent: true });
  context.sourceFiles = sourceFiles.files.filter((file) => file.text && typeof file.content === 'string');
  context.sourceFileNote = 'sourceFiles 只包含可编辑文本源码，不包含密钥、凭据和二进制文件。';
  if (selector) {
    const $ = load(html, { decodeEntities: false });
    const node = $(selector).first();
    if (!node.length) throw new Error(`找不到元素：${selector}`);
    context.selection = { selector, html: $.html(node), text: node.text().replace(/\s+/g, ' ').trim(), attributes: { ...node.attr() }, trigger: parseTrigger(node.attr('data-vse-trigger')) };
  }
  if (scope === 'project') {
    context.pages = [];
    for (const page of await listPages(projectId)) {
      const loaded = await readProjectHtml(projectId, page.path);
      context.pages.push({ path: page.path, html: loaded.html });
    }
    context.assets = await listAssets(projectId);
  }
  return context;
}

export async function applyChangeset(projectId, operations, pagePath = 'index.html') {
  if (!Array.isArray(operations) || !operations.length) throw new Error('operations 必须是非空数组');
  if (operations.length > 100) throw new Error('一次最多应用 100 个操作');
  const { html } = await readProjectHtml(projectId, pagePath);
  const $ = load(html, { decodeEntities: false });
  for (const [index, operation] of operations.entries()) {
    if (!operation || typeof operation.selector !== 'string' || !operation.selector.trim()) throw new Error(`第 ${index + 1} 个操作缺少 selector`);
    const element = $(operation.selector).first();
    if (!element.length) throw new Error(`找不到元素：${operation.selector}`);
    const kind = operation.op || operation.type || 'update';
    if (kind === 'delete') {
      if (element.is('body, html')) throw new Error('不能删除页面根节点');
      element.remove();
    } else if (kind === 'replaceHtml') {
      if (typeof operation.html !== 'string') throw new Error(`第 ${index + 1} 个 replaceHtml 缺少 html`);
      element.replaceWith(operation.html);
    } else if (kind === 'replaceImage') {
      if (typeof operation.src !== 'string') throw new Error(`第 ${index + 1} 个 replaceImage 缺少 src`);
      element.attr('src', operation.src);
      if (operation.alt !== undefined) element.attr('alt', operation.alt);
    } else if (kind === 'update') {
      if (operation.text !== undefined) element.text(String(operation.text));
      for (const [name, value] of Object.entries(operation.attributes || {})) { if (value === null || value === '') element.removeAttr(name); else element.attr(name, String(value)); }
      if (operation.styles && typeof operation.styles === 'object') { const style = parseInlineStyle(element.attr('style') || ''); Object.assign(style, operation.styles); element.attr('style', stringifyInlineStyle(style)); }
      if (operation.trigger !== undefined) { if (operation.trigger === null) element.removeAttr('data-vse-trigger'); else element.attr('data-vse-trigger', JSON.stringify(operation.trigger)); }
    } else throw new Error(`第 ${index + 1} 个操作类型不支持：${kind}`);
  }
  const output = $.html();
  const saved = await saveProjectHtml(projectId, output, pagePath);
  return { project: projectId, page: pagePath, applied: operations.length, bytes: saved.bytes };
}

export function parseInlineStyle(value) { return value.split(';').reduce((result, part) => { const [key, ...rest] = part.split(':'); if (key && rest.length) result[key.trim()] = rest.join(':').trim(); return result; }, {}); }
export function stringifyInlineStyle(style) { return Object.entries(style).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => `${key}: ${value}`).join('; '); }
