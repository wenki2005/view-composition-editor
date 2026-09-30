import { promises as fs } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { complete, getEnvApiKey, getModel } from '@earendil-works/pi-ai';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sessionFile = path.join(projectRoot, 'data', 'agent-sessions.json');
const settingsFile = path.join(projectRoot, 'data', 'agent-config.json');
const MAX_MESSAGES = 24;

let localSettings = {};
try { localSettings = JSON.parse(readFileSync(settingsFile, 'utf8')); } catch { localSettings = {}; }

const SYSTEM_PROMPT = `你是“可视化编辑器”的内置协作 Agent。你和用户一起调整本地静态网页的视觉、交互和多状态场景。

工作规则：
1. 先理解用户目标和上下文，再给出清晰、可执行的修改方案。
2. 你自动判断每一轮是否需要修改，不要把“聊天”和“修改”分成两个模式。普通问题直接自然回答；用户提出修改时，在同一条回复里先说明方案，再附带结构化 operations；没有修改时也要继续正常聊天。
3. 页面元素操作使用 CSS selector；项目级源码操作使用相对 path。除了 HTML/CSS 组件，你也可以根据用户要求读取和修改 JavaScript、JSON、SVG、Markdown、配置等文本源码。只改文字优先使用 text，只改属性使用 attributes，换图使用 replaceImage；删除元素使用 delete；只有确实需要重建结构时才使用 replaceHtml。
4. 只修改用户要求的范围；如果范围不清楚，先解释假设。
5. 上下文里的 focus/selection 是用户在画布中点选的组件。范围可能是页面或整个项目，但除非用户要求整体改造，优先把该组件当作精细修改焦点，并引用它的 selector。
6. 需要修改时，用一个 JSON 代码块表达：{"reply":"给用户看的说明","operations":[...]}；只聊天时不要输出这个 JSON。用户只是提问、讨论或让你解释时，直接正常聊天，不要输出空 operations。
7. 不要把 API 密钥、宿主机隐私文件或与页面无关的内容放进回复。

可用操作示例：
{"selector":".hero-button","styles":{"width":"220px","font-size":"16px"}}
{"op":"replaceImage","selector":"#cover","src":"assets/new-cover.png","alt":"封面"}
{"op":"delete","selector":".debug-panel"}
{"op":"patchFile","path":"js/app.js","find":"旧文本","replace":"新文本"}
{"op":"writeFile","path":"data/content.json","content":"{\"items\":[]}"}
{"op":"deleteFile","path":"old-config.json"}
`;

async function readSessions() {
  try { return JSON.parse(await fs.readFile(sessionFile, 'utf8')); } catch { return {}; }
}

async function writeSessions(sessions) {
  await fs.mkdir(path.dirname(sessionFile), { recursive: true });
  const tempFile = `${sessionFile}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(sessions, null, 2)}\n`, 'utf8');
  await fs.rename(tempFile, sessionFile);
}

function sessionId(value = '') {
  const safe = String(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return safe || `agent_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function textFromAssistant(message) {
  if (typeof message === 'string') return message.trim();
  if (typeof message?.text === 'string') return message.text.trim();
  if (typeof message?.content === 'string') return message.content.trim();
  if (Array.isArray(message?.content)) return message.content.map((block) => typeof block === 'string' ? block : block?.text || block?.content || '').join('\n').trim();
  return '';
}

function normalizeMessageForModel(message) {
  if (!message || message.role !== 'assistant' || typeof message.content === 'string') {
    if (message?.role === 'assistant' && typeof message.content === 'string') return { ...message, content: [{ type: 'text', text: message.content }] };
    return message;
  }
  return message;
}

function extractResult(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidates = [fenced?.[1], text].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && (Array.isArray(parsed.operations) || typeof parsed.reply === 'string')) return { reply: String(parsed.reply || ''), operations: Array.isArray(parsed.operations) ? parsed.operations : [] };
    } catch { /* continue to a more permissive extraction */ }
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (parsed && typeof parsed === 'object' && (Array.isArray(parsed.operations) || typeof parsed.reply === 'string')) return { reply: String(parsed.reply || ''), operations: Array.isArray(parsed.operations) ? parsed.operations : [] };
    } catch { /* keep plain text */ }
  }
  return { reply: text, operations: [] };
}

function providerConfig() {
  const provider = process.env.VSE_AI_PROVIDER || localSettings.provider || 'openai';
  const model = process.env.VSE_AI_MODEL || localSettings.model || 'gpt-4o-mini';
  const apiUrl = String(process.env.VSE_AI_BASE_URL || localSettings.apiUrl || '').replace(/\s+/g, '');
  const apiKey = process.env.VSE_AI_API_KEY || localSettings.apiKey || getEnvApiKey(provider);
  return {
    provider,
    model,
    apiUrl,
    configured: Boolean(apiKey || apiUrl),
    apiKey,
  };
}

export function getAgentConfig() { const { apiKey, ...safe } = providerConfig(); return safe; }

export async function saveAgentConfig({ provider, model, apiKey } = {}) {
  const input = arguments[0] || {};
  const nextApiUrl = Object.prototype.hasOwnProperty.call(input, 'apiUrl') ? String(input.apiUrl || '') : Object.prototype.hasOwnProperty.call(input, 'baseUrl') ? String(input.baseUrl || '') : String(localSettings.apiUrl || '');
  const nextApiKey = Object.prototype.hasOwnProperty.call(input, 'apiKey') ? String(apiKey || '') : String(localSettings.apiKey || '');
  localSettings = { provider: String(provider || localSettings.provider || 'openai'), model: String(model || localSettings.model || 'gpt-4o-mini'), apiUrl: nextApiUrl, ...(nextApiKey ? { apiKey: nextApiKey } : {}) };
  await fs.mkdir(path.dirname(settingsFile), { recursive: true });
  await fs.writeFile(settingsFile, `${JSON.stringify(localSettings, null, 2)}\n`, 'utf8');
  return getAgentConfig();
}

function customModel(config) {
  const baseUrl = String(config.apiUrl || '').trim().replace(/\s+/g, '').replace(/\/(?:chat\/)?completions\/?$/i, '').replace(/\/$/, '');
  if (!baseUrl) return getModel(config.provider, config.model);
  return {
    id: config.model,
    name: `${config.model} (${config.provider})`,
    api: 'openai-completions',
    provider: config.provider || 'custom-openai',
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 32000,
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
  };
}

export async function listAgentSessions() {
  const sessions = await readSessions();
  return Object.values(sessions).map(({ id, title, project, page, updatedAt, messageCount }) => ({ id, title, project, page, updatedAt, messageCount: messageCount || 0 })).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function getAgentSession(id) {
  const sessions = await readSessions();
  const session = sessions[id];
  if (!session) return null;
  return { ...session, messageCount: session.messages?.length || 0 };
}

export async function resetAgentSession(id) {
  const sessions = await readSessions();
  delete sessions[id];
  await writeSessions(sessions);
  return { id, deleted: true };
}

export async function runAgentTurn({ id, message, context = {}, project = '', page = 'index.html', title = '' }) {
  const userMessage = String(message || '').trim();
  if (!userMessage) throw new Error('请输入要和 Agent 协作的内容');
  const config = providerConfig();
  if (!config.configured) throw new Error(`还没有配置模型密钥或 API 地址。请设置 ${config.provider === 'openai' ? 'OPENAI_API_KEY' : 'VSE_AI_API_KEY'}，也可以在 AI 协作面板的模型设置中保存。`);
  const sessions = await readSessions();
  const currentId = sessionId(id);
  const session = sessions[currentId] || { id: currentId, title: title || userMessage.slice(0, 32), project, page, createdAt: new Date().toISOString(), messages: [] };
  session.project = project || session.project;
  session.page = page || session.page;
  session.updatedAt = new Date().toISOString();
  session.messages = (session.messages || []).map((item) => {
    if (item?.role !== 'user' || typeof item.content !== 'string') return item;
    return { ...item, content: item.content.split('\n\n[编辑器当前上下文]')[0].trim() };
  }).filter((item) => item?.content);
  const contextText = JSON.stringify(context || {}, null, 2);
  const prompt = `${userMessage}\n\n[编辑器当前上下文]\n${contextText}\n\n请像普通聊天一样回答。如果需要改页面，再附带 operations JSON；不需要修改时只返回自然语言。`;
  session.messages.push({ role: 'user', content: userMessage, timestamp: Date.now() });
  session.messages = session.messages.slice(-MAX_MESSAGES);
  const modelMessages = [...session.messages.slice(0, -1).map(normalizeMessageForModel), { role: 'user', content: prompt, timestamp: Date.now() }];
  const model = customModel(config);
  const response = await complete(model, { systemPrompt: SYSTEM_PROMPT, messages: modelMessages }, { apiKey: config.apiKey || (config.apiUrl ? 'local' : undefined) });
  const raw = textFromAssistant(response);
  const parsed = extractResult(raw);
  const assistantText = parsed.reply || raw || '我暂时没有收到模型的文字回复。请检查 API 兼容性后重试。';
  const fileOperationCount = parsed.operations.filter((operation) => ['writeFile', 'replaceFile', 'patchFile', 'deleteFile'].includes(operation?.op || operation?.type)).length;
  const pageOperationCount = parsed.operations.length - fileOperationCount;
  const trace = [
    { type: 'tool', label: '读取编辑器上下文', detail: `${context.scope || 'page'} · ${context.sourceFiles?.length || 0} 个源码文件` },
    { type: 'model', label: '调用模型', detail: `${config.provider}/${config.model}` },
    { type: 'decision', label: '本轮判断', detail: fileOperationCount ? `项目源码修改 · ${fileOperationCount} 个文件操作` : pageOperationCount ? `页面修改 · ${pageOperationCount} 个元素操作` : '自然对话 · 不写入文件' },
  ];
  session.messages.push({ role: 'assistant', content: [{ type: 'text', text: assistantText }], trace, timestamp: Date.now() });
  session.messages = session.messages.slice(-MAX_MESSAGES);
  session.messageCount = session.messages.length;
  sessions[currentId] = session;
  await writeSessions(sessions);
  return { sessionId: currentId, reply: assistantText, operations: parsed.operations, trace, raw, model: `${config.provider}/${config.model}`, messageCount: session.messages.length };
}

export async function testAgentConnection(input = {}) {
  const env = providerConfig();
  const config = { provider: String(input.provider || env.provider), model: String(input.model || env.model), apiUrl: String(input.apiUrl || input.baseUrl || env.apiUrl), apiKey: String(input.apiKey || env.apiKey || '') };
  if (!config.apiKey && !config.apiUrl) throw new Error('请先填写 API Key 或 API 地址');
  const model = customModel(config);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await complete(model, { systemPrompt: '你是连接测试助手，只回复“连接成功”。', messages: [{ role: 'user', content: '请只回复：连接成功', timestamp: Date.now() }] }, { apiKey: config.apiKey || (config.apiUrl ? 'local' : undefined), signal: controller.signal });
    const reply = textFromAssistant(response).slice(0, 120);
    if (!reply) throw new Error('模型返回为空。API 地址请填写服务商的 OpenAI 兼容根地址，例如 https://host/v1，不要填写 /chat/completions 或 /completions。');
    return { ok: true, provider: config.provider, model: config.model, apiUrl: config.apiUrl, reply };
  } finally { clearTimeout(timer); }
}
