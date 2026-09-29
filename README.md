# 视图作文 · 可视化编辑器

这是一个本地优先的网页可视化编辑器，面向本仓库已有的静态 HTML/CSS/JavaScript 项目。它把 Design Mode、VisBug、Deckflow HTML Editor、GrapesJS/VvvebJs 的思路组合成一个可直接运行的编辑工作台，并提供一个 MCP stdio 服务供 AI 客户端连接。

交付目录：`D:\视图作文可视化编辑器-分发版`

## 当前能力

- 自动发现工作区中带 `index.html`、`main.html` 或其他 HTML 入口的静态项目。
- 项目内有多个 HTML 页面时，可在顶部页面选择器切换具体页面。
- 打开项目和切换页面后会自动适应画布，也可以手动输入自定义预览宽度和高度。
- 可切换手机、横屏手机、平板、笔记本和桌面视口预设；画布以带标签页、地址栏和窗口边框的非全屏浏览器窗口显示，方便检查不同屏幕布局。
- 在真实项目页面 iframe 中点击选择元素。
- 选择元素后先确认，再开始修改；可以固定元素，让选择操作继续深入到子元素。
- 拖动和缩放支持 8px 网格磁吸，可随时关闭。
- 选中并确认元素后，可以用右侧缩放滑块或百分比输入放大/缩小图片和任意页面元素；缩放支持撤销、重做和保存。
- 测试预览会用当前未保存状态运行页面，退出后回到编辑模式。
- 左键只负责选择元素，右键会在编辑器内触发页面交互，方便先切换场景再调整当前状态。
- 可以删除已确认的元素，删除后可用撤销恢复。
- 可展开/折叠的层级图层树、搜索、元素定位；图层区和画布都有独立滚动条。
- 修改 X/Y、宽、高、透明度、圆角、背景色、层级和文本。
- 从项目 `assets/` 素材库替换图片，或上传新图片到 `assets/editor/`。
- 配置 `hover`、`click`、`appear`、`scroll`、`viewProgress` 触发器。
- 交互面板会识别按钮、链接、表单控件、折叠面板和内联事件，区分“原生交互”和编辑器新增触发器。
- 场景面板可以捕获右键交互后的页面状态，按页面和设备保存并恢复多状态画布。
- AI 协作面板内置连续 Agent 对话；点选元素后会自动带入焦点上下文，普通消息读取当前页面，提到“全局/整个项目/所有页面”时读取整个项目。
- 内置 Agent 支持持久化会话；点选组件后会把 selector、DOM、尺寸、样式、触发器和原生交互作为焦点上下文发送，同时允许切换到页面或整个项目做整体修改。
- Agent 不只修改 HTML/CSS 组件：它会读取当前项目可编辑的 JavaScript、CSS、JSON、SVG、Markdown 和配置源码，并可在确认后通过对话修改、替换或删除这些底层文件。
- 每轮 Agent 回复都可以展开“查看工作记录”，看到上下文读取、模型调用、自动判断结果和待确认的工具操作摘要；普通聊天与修改可以在同一个会话里混合进行。
- 配置滚动起点、终点、动画效果和触发区扩展值。
- 编辑器会话内撤销/重做。
- 代码面板可以直接读取、编辑并保存项目中的 HTML、CSS、JavaScript、JSON、SVG 和 Markdown 文本文件；保存后可用“刷新预览”重新连接画布查看结果。
- 底部版本号按钮可以查看完整更新记录。
- 顶部提供“撤销一步 / 恢复一步”，显示当前历史步骤，并支持 `Ctrl+Z`、`Ctrl+Y` 和 `Ctrl+Shift+Z` 快捷键。
- 将 HTML 和 `.visual-editor/page-config.json` 保存回原项目。
- MCP 工具：列项目、检查结构、读 HTML、读素材、修改元素、替换图片、设置触发器和保存配置。

触发器当前以 `data-vse-trigger` 属性保存，例如：

```html
<section data-vse-trigger='{"type":"viewProgress","effect":"fade","rangeStart":20,"rangeEnd":80,"padding":12}'>
```

页面运行时如果要真正播放动画，可以在项目自己的 `js/` 中读取这个属性，接入 Wix Interact、CSS Scroll Timeline 或现有动画逻辑。

## 目录结构

```text
可视化编辑器/
├─ index.html              编辑器界面
├─ css/style.css           编辑器样式
├─ js/app.js               选择、检查器、素材和保存逻辑
├─ server/http.mjs         本地预览与文件 API
├─ server/fs-utils.mjs     项目扫描、文件读写和 HTML 操作
├─ server/mcp.mjs          MCP stdio 服务
├─ config/                 预留的编辑器配置目录
├─ data/workspaces.json    已选择项目的文件夹记录
├─ PRODUCT.md              产品上下文
├─ DESIGN.md               界面设计方向
├─ CHANGELOG.md            更新记录
├─ package.json            运行脚本和依赖
├─ 启动编辑器.cmd          Windows 一键启动入口
├─ 启动MCP.cmd             Windows MCP 启动入口
└─ README.md               本说明
```

## 运行

要求：Node.js 22.19 或更高版本（内置 Pi Agent 依赖此版本）。

Windows 用户可以直接双击项目目录中的 `启动编辑器.cmd`。它会自动检查 Node.js、安装依赖、启动服务并打开浏览器。

```powershell
cd D:\视图作文可视化编辑器-分发版
npm install
npm start
```

然后打开：<http://127.0.0.1:4177>

也可以使用命令行启动：

程序默认扫描 `D:\视图作文` 下的项目，也可以在编辑器顶部点击“浏览文件夹”，输入绝对路径或从任意磁盘目录中选择包含 HTML 页面（例如 `index.html`、`main.html`）的项目。进入项目目录后可以点击“选择当前文件夹”。选择过的项目路径会保存在编辑器的 `data/workspaces.json` 中，之后可以直接继续使用。

## 分发给别人

可以直接把整个 `视图作文可视化编辑器-分发版` 文件夹，或者同名 ZIP 文件发给别人。对方需要安装 Node.js 22.19 或更高版本，然后双击 `启动编辑器.cmd`。第一次启动会自动安装依赖，之后会自动打开本地编辑器。分发版已经清空了本机已选项目、Agent 会话和 API 配置；对方可在 AI 设置中填写自己的 Provider、模型、API 地址和密钥，也可以从“浏览文件夹”选择自己的项目目录。

## MCP 连接

启动 MCP stdio 服务：

Windows 用户可以双击 `启动MCP.cmd`，或者使用下面的命令：

```powershell
cd D:\视图作文可视化编辑器-分发版
npm run mcp
```

以 Claude Desktop 为例，可在 MCP 配置中加入：

```json
{
  "mcpServers": {
    "视图作文可视化编辑器": {
      "command": "node",
      "args": ["D:\\视图作文可视化编辑器\\server\\mcp.mjs"]
    }
  }
}
```

可用工具：

| 工具 | 作用 |
|---|---|
| `browse_files` | 浏览 D 盘文件夹并查找项目 |
| `register_project` | 把任意包含 HTML 入口页面的文件夹加入项目列表 |
| `list_projects` | 列出可编辑项目 |
| `list_pages` | 列出项目中的 HTML 页面 |
| `inspect_project` | 读取指定页面的元素、图片和触发器摘要 |
| `get_project_html` | 读取当前 `index.html` |
| `get_editor_context` | 按元素、页面或整个项目读取 AI 协作上下文 |
| `get_assets` | 列出素材文件 |
| `list_project_files` | 列出项目底层源码文件，可选返回文本内容 |
| `read_project_file` | 读取项目中的 JavaScript、CSS、JSON、SVG 等文本文件 |
| `write_project_file` | 写入项目源码文件 |
| `update_element` | 按 CSS 选择器修改文字、样式、属性和触发器 |
| `replace_image` | 替换图片地址 |
| `set_trigger` | 设置或移除交互触发器 |
| `apply_changeset` | 一次性应用 AI 返回的结构化修改集 |
| `apply_project_changeset` | 一次性应用页面元素和源码文件修改集 |
| `get_page_config` | 读取编辑器配置 |
| `save_page_config` | 保存批量页面配置 |

内置 Agent HTTP API：

| API | 作用 |
|---|---|
| `GET /api/agent/config` | 查看 Agent 当前 provider/model/API 地址和是否已配置 |
| `POST /api/agent/config` | 配置 provider、model、apiUrl、apiKey；兼容 OpenAI 协议的服务商可填自定义 API 地址 |
| `POST /api/agent/test` | 用当前配置发起一次最小模型请求，返回真实连接错误或成功响应 |
| `GET /api/agent/sessions` | 列出持久化会话 |
| `GET /api/agent/session?id=...` | 读取一条会话的完整上下文消息 |
| `POST /api/agent/chat` | 发送一轮消息，返回自然语言 reply、可选 operations 和可见工作记录 trace |
| `DELETE /api/agent/session?id=...` | 删除一条会话 |

启动前配置模型（示例）：

```powershell
$env:VSE_AI_PROVIDER = "openai"
$env:VSE_AI_MODEL = "gpt-4o-mini"
$env:OPENAI_API_KEY = "你的密钥"
npm start
```

也可以用 `VSE_AI_API_KEY` 作为本项目专用密钥变量。兼容 OpenAI API 的本地模型可以配置 `VSE_AI_BASE_URL=http://127.0.0.1:11434/v1`，API Key 可留空。面板中保存的服务商设置位于 `data/agent-config.json`，会话记录位于 `data/agent-sessions.json`。

项目源码 API（本地服务基址为 `http://127.0.0.1:4177`）：

| API | 作用 |
|---|---|
| `GET /api/project/files?project=项目ID&content=1` | 列出项目源码，`content=1` 时同时返回可读文本内容 |
| `GET /api/project/file?project=项目ID&path=js/app.js` | 读取一个项目源码文件 |
| `POST /api/project/file?project=项目ID` | 写入 `{ "path": "js/app.js", "content": "..." }` |
| `POST /api/project/changeset?project=项目ID` | 应用页面操作和 `writeFile`、`patchFile`、`deleteFile` 等项目级操作 |

源码修改会显示在 AI 对话中，只有点击“确认应用修改”才会执行；普通聊天不需要输出 JSON，也不会被强制转换成修改操作。
建议 AI 的操作顺序：先 `list_projects`，再 `inspect_project`，读取并确认目标元素后调用修改工具。任何会写入文件的操作都应在用户明确要求后执行。

## Pi 协作工作流

本项目不把模型密钥写进编辑器，也不强行捆绑某个模型。Pi 可以通过 MCP stdio 连接 `server/mcp.mjs`，使用 `get_editor_context` 读取指定范围，再生成如下格式的修改集：

```json
{
  "operations": [
    { "selector": ".hero-button", "styles": { "width": "220px", "font-size": "16px" } },
    { "op": "replaceImage", "selector": "#cover", "src": "assets/new-cover.png", "alt": "封面" }
  ]
}
```

在编辑器的“AI 协作”面板中，Agent 会保留连续会话并返回修改建议；对话中的“确认应用修改”会把 operations 作为一个可撤销步骤应用。支持 `update`、`replaceImage`、`replaceHtml`、`delete` 四类操作；应用前始终需要人工确认，应用后可以用“撤销一步”回退。

Pi 本身是可扩展的 agent harness，官方仓库为 [earendil-works/pi](https://github.com/earendil-works/pi)。建议把它当作外部协作层连接本项目 MCP，而不是把模型运行时和编辑器耦合在一起。Pi 默认会继承宿主进程权限，生产环境请只给它必要的项目目录权限，并保留人工确认步骤。

## 开源项目依据

- [GrapesJS](https://github.com/GrapesJS/grapesjs)：组件、图层、资源管理和网页编辑器结构。
- [VvvebJs](https://github.com/givanz/Vvvebjs)：原生 JavaScript 静态网页编辑、图片上传和导出思路。
- [ProjectVisBug](https://github.com/GoogleChromeLabs/ProjectVisBug)：浏览器内选中、测量和替换图片的交互方式。
- [Design Mode](https://github.com/SandeepBaskaran/design-mode)：现有网页上的视觉检查、设计控制和触发器面板思路。
- [Deckflow HTML Editor](https://github.com/deckflow/html-editor)：本地 HTML 目录和定向保存的工作流。
- [scroll-timeline-builder](https://github.com/css-scroll-driven/scroll-timeline-builder)：滚动动画范围和关键帧表达。
- [Wix Interact](https://github.com/wix/interact)：触发器和动画配置的运行时模型。

## 后续扩展方向

1. 将 CSS 修改从内联样式升级为可回写到 `css/` 文件的定向 patch。
2. 增加真正的热点矩形编辑器，让点击/悬停范围可以在画布中直接拖动。
3. 在预览运行时加载 `data-vse-trigger`，实现无需手写 JS 的动画播放。
4. 加入版本快照和 Git diff 预览。
5. 增加 Streamable HTTP MCP 传输，供远程 AI 客户端连接；当前版本先提供本地 stdio，适合桌面 AI 客户端。

