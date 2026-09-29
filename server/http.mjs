import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  editorRoot,
  browseDirectory,
  getProject,
  listAssets,
  listPages,
  listProjects,
  projectFile,
  readProjectConfig,
  readProjectFile,
  readProjectHtml,
  registerProject,
  listProjectFiles,
  applyProjectChangeset,
  saveAssetDataUrl,
  saveProjectConfig,
  saveProjectHtml,
  writeProjectFile,
  updateElement,
} from './fs-utils.mjs';
import { getAgentConfig, getAgentSession, listAgentSessions, resetAgentSession, runAgentTurn, saveAgentConfig, testAgentConnection } from './agent.mjs';

const port = Number(process.env.VSE_PORT || 4177);
const host = process.env.VSE_HOST || '127.0.0.1';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 20 * 1024 * 1024) throw new Error('请求体超过 20 MB');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveFile(res, filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return false;
    res.writeHead(200, {
      'content-type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    (await import('node:fs')).createReadStream(filePath).pipe(res);
    return true;
  } catch { return false; }
}

async function serveWorkspaceFile(res, pathname) {
  const pieces = pathname.split('/').filter(Boolean);
  if (pieces.length < 2 || pieces[0] !== 'site') return false;
  const projectId = decodeURIComponent(pieces[1]);
  const relativePath = pieces.slice(2).map((part) => decodeURIComponent(part)).join('/') || 'index.html';
  const project = await getProject(projectId);
  return serveFile(res, projectFile(project, relativePath));
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ok: true, name: '视图编辑器', version: '0.2.0' });
  if (req.method === 'GET' && url.pathname === '/api/agent/config') return sendJson(res, 200, { agent: getAgentConfig() });
  if (req.method === 'POST' && url.pathname === '/api/agent/config') return sendJson(res, 200, { agent: await saveAgentConfig(await readBody(req)) });
  if (req.method === 'POST' && url.pathname === '/api/agent/test') return sendJson(res, 200, await testAgentConnection(await readBody(req)));
  if (req.method === 'GET' && url.pathname === '/api/agent/sessions') return sendJson(res, 200, { sessions: await listAgentSessions() });
  if (req.method === 'GET' && url.pathname === '/api/agent/session') {
    const session = await getAgentSession(url.searchParams.get('id') || '');
    return sendJson(res, session ? 200 : 404, session || { error: '会话不存在' });
  }
  if (req.method === 'DELETE' && url.pathname === '/api/agent/session') return sendJson(res, 200, await resetAgentSession(url.searchParams.get('id') || ''));
  if (req.method === 'POST' && url.pathname === '/api/agent/chat') {
    const body = await readBody(req);
    const result = await runAgentTurn(body);
    return sendJson(res, 200, result);
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') return sendJson(res, 200, { projects: await listProjects() });
  if (req.method === 'GET' && url.pathname === '/api/files/browse') return sendJson(res, 200, await browseDirectory(url.searchParams.get('path') || undefined));
  if (req.method === 'POST' && url.pathname === '/api/projects/register') {
    const body = await readBody(req);
    const project = await registerProject(body.path);
    return sendJson(res, 200, { ok: true, project });
  }

  const projectId = url.searchParams.get('project');
  const pagePath = url.searchParams.get('page') || 'index.html';
  if (req.method === 'GET' && url.pathname === '/api/project/pages' && projectId) return sendJson(res, 200, { pages: await listPages(projectId) });
  if (req.method === 'GET' && url.pathname === '/api/project/html' && projectId) {
    const result = await readProjectHtml(projectId, pagePath);
    return sendJson(res, 200, { project: result.project.name, page: result.page, html: result.html });
  }
  if (req.method === 'GET' && url.pathname === '/api/project/config' && projectId) return sendJson(res, 200, { config: await readProjectConfig(projectId, pagePath) });
  if (req.method === 'GET' && url.pathname === '/api/project/assets' && projectId) return sendJson(res, 200, { assets: await listAssets(projectId) });
  if (req.method === 'GET' && url.pathname === '/api/project/files' && projectId) {
    const includeContent = url.searchParams.get('content') === '1';
    return sendJson(res, 200, await listProjectFiles(projectId, { includeContent }));
  }
  if (req.method === 'GET' && url.pathname === '/api/project/file' && projectId) {
    return sendJson(res, 200, await readProjectFile(projectId, url.searchParams.get('path') || ''));
  }

  if (req.method === 'POST' && url.pathname === '/api/project/html' && projectId) {
    const body = await readBody(req);
    const result = await saveProjectHtml(projectId, String(body.html || ''), pagePath);
    return sendJson(res, 200, { ok: true, bytes: result.bytes });
  }
  if (req.method === 'POST' && url.pathname === '/api/project/config' && projectId) {
    const body = await readBody(req);
    const result = await saveProjectConfig(projectId, body.config || {}, pagePath);
    return sendJson(res, 200, { ok: true, file: result.file });
  }
  if (req.method === 'POST' && url.pathname === '/api/project/asset' && projectId) {
    const body = await readBody(req);
    const result = await saveAssetDataUrl(projectId, body.path, body.dataUrl);
    return sendJson(res, 200, { ok: true, asset: result });
  }
  if (req.method === 'POST' && url.pathname === '/api/project/file' && projectId) {
    const body = await readBody(req);
    return sendJson(res, 200, { ok: true, file: await writeProjectFile(projectId, body.path, String(body.content ?? '')) });
  }
  if (req.method === 'POST' && url.pathname === '/api/project/changeset' && projectId) {
    const body = await readBody(req);
    return sendJson(res, 200, { ok: true, result: await applyProjectChangeset(projectId, body.operations, pagePath) });
  }
  if (req.method === 'POST' && url.pathname === '/api/project/element' && projectId) {
    const body = await readBody(req);
    const result = await updateElement(projectId, body.selector, body.changes || {}, pagePath);
    return sendJson(res, 200, { ok: true, selector: result.selector });
  }
  return sendJson(res, 404, { error: 'API 路径不存在' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/site/')) {
      if (await serveWorkspaceFile(res, url.pathname)) return;
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('页面或资源不存在');
    }
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
    const filePath = path.resolve(editorRoot, relative);
    if (filePath !== editorRoot && !filePath.startsWith(`${editorRoot}${path.sep}`)) {
      res.writeHead(403); return res.end('Forbidden');
    }
    if (await serveFile(res, filePath)) return;
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('资源不存在');
  } catch (error) {
    console.error(error);
    sendJson(res, 400, { error: error.message || '请求失败' });
  }
});

server.listen(port, host, () => {
  console.error(`视图编辑器运行于 http://${host}:${port}`);
});
