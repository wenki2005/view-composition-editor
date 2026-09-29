import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  browseDirectory,
  applyChangeset,
  getEditorContext,
  inspectHtml,
  listAssets,
  listProjectFiles,
  listPages,
  listProjects,
  readProjectFile,
  readProjectConfig,
  readProjectHtml,
  registerProject,
  saveProjectConfig,
  writeProjectFile,
  applyProjectChangeset,
  updateElement,
} from './fs-utils.mjs';

const server = new McpServer(
  { name: '视图作文可视化编辑器', version: '0.2.0' },
  {
    instructions: '这是一个本地静态网页可视化编辑器。先调用 browse_files 或 list_projects 找到项目，再调用 inspect_project 了解结构。修改元素后使用 save_page_config 或 update_element；任何会改写文件的工具都应在用户明确要求后调用。项目可以来自 D 盘任意包含 index.html 的文件夹。',
  },
);

function result(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

server.registerTool(
  'browse_files',
  {
    title: '浏览本地文件夹',
    description: '浏览本机文件夹并识别包含 index.html 的可编辑项目。默认从 D 盘根目录开始。',
    inputSchema: z.object({ path: z.string().optional().describe('绝对文件夹路径，例如 D:\\视图作文') }),
    annotations: { readOnlyHint: true },
  },
  async ({ path: directoryPath }) => result(await browseDirectory(directoryPath)),
);

server.registerTool(
  'register_project',
  {
    title: '添加本地项目',
    description: '把一个包含 index.html 的本地文件夹加入项目列表，之后可以使用其他项目编辑工具。',
    inputSchema: z.object({ path: z.string().describe('包含 index.html 的绝对文件夹路径') }),
  },
  async ({ path: directoryPath }) => result(await registerProject(directoryPath)),
);

server.registerTool(
  'list_projects',
  {
    title: '列出静态网页项目',
    description: '列出工作区中可以被可视化编辑器打开的静态项目。',
    annotations: { readOnlyHint: true },
  },
  async () => result((await listProjects()).map(({ id, name, path, updatedAt, size }) => ({ id, name, path, updatedAt, size }))),
);

server.registerTool(
  'list_pages',
  {
    title: '列出项目页面',
    description: '列出指定项目中的所有 HTML 页面，用于选择要编辑的页面。',
    inputSchema: z.object({ project: z.string() }),
    annotations: { readOnlyHint: true },
  },
  async ({ project }) => result({ project, pages: await listPages(project) }),
);

server.registerTool(
  'inspect_project',
  {
    title: '检查页面结构',
    description: '读取项目 index.html 的标题、可见元素摘要、图片和已保存的触发器元数据。',
    inputSchema: z.object({ project: z.string().describe('list_projects 返回的项目 id，或项目名称'), page: z.string().optional().describe('页面路径，默认 index.html') }),
    annotations: { readOnlyHint: true },
  },
  async ({ project, page }) => {
    const { html } = await readProjectHtml(project, page || 'index.html');
    return result({ project, page: page || 'index.html', ...inspectHtml(html) });
  },
);

server.registerTool(
  'get_project_html',
  {
    title: '读取页面 HTML',
    description: '读取指定项目当前保存的 index.html。',
    inputSchema: z.object({ project: z.string(), page: z.string().optional() }),
    annotations: { readOnlyHint: true },
  },
  async ({ project, page }) => {
    const { html } = await readProjectHtml(project, page || 'index.html');
    return result({ project, page: page || 'index.html', html });
  },
);

server.registerTool(
  'get_editor_context',
  {
    title: '读取 AI 协作上下文',
    description: '按当前元素、当前页面或整个项目返回 HTML、元素摘要、配置和素材，适合 Pi 等 AI 客户端先读取再提出修改方案。',
    inputSchema: z.object({ project: z.string(), page: z.string().optional(), scope: z.enum(['selection', 'scene', 'page', 'project']).optional(), selector: z.string().optional() }),
    annotations: { readOnlyHint: true },
  },
  async ({ project, page, scope, selector }) => result(await getEditorContext(project, page || 'index.html', scope || 'page', selector || '')),
);

server.registerTool(
  'get_assets',
  {
    title: '列出图片素材',
    description: '列出指定项目 assets 目录下的素材路径和预览 URL。',
    inputSchema: z.object({ project: z.string() }),
    annotations: { readOnlyHint: true },
  },
  async ({ project }) => result({ project, assets: await listAssets(project) }),
);

server.registerTool(
  'list_project_files',
  {
    title: '列出项目源码文件',
    description: '列出项目中可编辑的 HTML、CSS、JavaScript、JSON、SVG、Markdown 和配置文本文件。密钥、凭据和二进制文件会被排除。',
    inputSchema: z.object({ project: z.string(), includeContent: z.boolean().optional() }),
    annotations: { readOnlyHint: true },
  },
  async ({ project, includeContent }) => result(await listProjectFiles(project, { includeContent: Boolean(includeContent) })),
);

server.registerTool(
  'read_project_file',
  {
    title: '读取项目源码文件',
    description: '读取项目内任意相对路径的文本源码，适合先了解 JavaScript、CSS、JSON、SVG 或其他底层内容。',
    inputSchema: z.object({ project: z.string(), path: z.string() }),
    annotations: { readOnlyHint: true },
  },
  async ({ project, path: relativePath }) => result(await readProjectFile(project, relativePath)),
);

server.registerTool(
  'write_project_file',
  {
    title: '写入项目源码文件',
    description: '按相对路径写入项目文本源码。适合 AI 在用户明确要求后修改 JavaScript、CSS、JSON、HTML、SVG 或配置文件。',
    inputSchema: z.object({ project: z.string(), path: z.string(), content: z.string() }),
  },
  async ({ project, path: relativePath, content }) => result(await writeProjectFile(project, relativePath, content)),
);

server.registerTool(
  'apply_project_changeset',
  {
    title: '应用项目级修改集',
    description: '一次性应用页面元素和项目源码修改。页面操作支持 update、replaceImage、replaceHtml、delete；源码操作支持 writeFile、replaceFile、patchFile、deleteFile。',
    inputSchema: z.object({ project: z.string(), page: z.string().optional(), operations: z.array(z.record(z.string(), z.unknown())).min(1).max(100) }),
  },
  async ({ project, page, operations }) => result(await applyProjectChangeset(project, operations, page || 'index.html')),
);

server.registerTool(
  'update_element',
  {
    title: '修改页面元素',
    description: '按 CSS 选择器修改元素文字、内联样式、HTML 属性或触发器元数据，并保存回项目。',
    inputSchema: z.object({
      project: z.string(),
      page: z.string().optional(),
      selector: z.string().describe('CSS 选择器，例如 .hero-title 或 #main-image'),
      text: z.string().optional(),
      styles: z.record(z.string(), z.string()).optional().describe('CSS 属性到值的映射，例如 {"left":"120px","width":"320px"}'),
      attributes: z.record(z.string(), z.string().nullable()).optional(),
      trigger: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
  },
  async ({ project, page, selector, text, styles, attributes, trigger }) => result(await updateElement(project, selector, { text, styles, attributes, trigger }, page || 'index.html')),
);

server.registerTool(
  'replace_image',
  {
    title: '替换图片',
    description: '修改指定 img 或带背景图元素的资源地址。src 可以是项目内相对路径、绝对 URL 或 data URL。',
    inputSchema: z.object({ project: z.string(), page: z.string().optional(), selector: z.string(), src: z.string(), alt: z.string().optional() }),
  },
  async ({ project, page, selector, src, alt }) => result(await updateElement(project, selector, { attributes: { src, ...(alt === undefined ? {} : { alt }) } }, page || 'index.html')),
);

server.registerTool(
  'set_trigger',
  {
    title: '设置交互触发器',
    description: '给页面元素设置 hover、click、appear、scroll 或 viewProgress 触发器，包含触发范围和效果参数。传 null 可移除。',
    inputSchema: z.object({ project: z.string(), page: z.string().optional(), selector: z.string(), trigger: z.record(z.string(), z.unknown()).nullable() }),
  },
  async ({ project, page, selector, trigger }) => result(await updateElement(project, selector, { trigger }, page || 'index.html')),
);

server.registerTool(
  'apply_changeset',
  {
    title: '应用 AI 修改集',
    description: '一次性应用一组经过用户确认的结构化页面修改，并只写回一次文件。支持 update、replaceImage、replaceHtml、delete；建议先调用 get_editor_context。',
    inputSchema: z.object({ project: z.string(), page: z.string().optional(), operations: z.array(z.record(z.string(), z.unknown())).min(1).max(100) }),
  },
  async ({ project, page, operations }) => result(await applyChangeset(project, operations, page || 'index.html')),
);

server.registerTool(
  'get_page_config',
  {
    title: '读取页面配置',
    description: '读取项目 .visual-editor/page-config.json。',
    inputSchema: z.object({ project: z.string(), page: z.string().optional() }),
    annotations: { readOnlyHint: true },
  },
  async ({ project, page }) => result({ project, page: page || 'index.html', config: await readProjectConfig(project, page || 'index.html') }),
);

server.registerTool(
  'save_page_config',
  {
    title: '保存页面配置',
    description: '保存可视化编辑器的页面配置 JSON，适合批量描述元素位置、资源和触发器。',
    inputSchema: z.object({ project: z.string(), page: z.string().optional(), config: z.record(z.string(), z.unknown()) }),
  },
  async ({ project, page, config }) => result(await saveProjectConfig(project, config, page || 'index.html')),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('视图作文可视化编辑器 MCP server 已连接（stdio）');
