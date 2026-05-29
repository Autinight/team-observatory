# Subagent Observatory 系统重构计划书

状态：Draft  
日期：2026-05-29  
适用仓库：`D:/Hanako/Shiraha/Hana-Plugins/subagent-observatory`  
插件 ID：`team-observatory`

---

## 1. 背景与结论

本计划基于对当前仓库的静态审查结果制定。当前插件可以正常迭代，目录也已有基本分层：

```text
assets/          iframe 前端资源
lib/             snapshot 聚合与诊断逻辑
routes/          插件 HTTP/SSE 路由
tools/           Hana plugin tools
index.js         lifecycle 与事件订阅
manifest.json    插件声明
```

但复杂度已经集中在两个重力井中：

```text
assets/app.js          982 行
lib/team-snapshot.js   772 行
```

总体判断：**已有屎山趋势，但未形成严重屎山**。

主要风险不是当前功能失效，而是未来继续加功能时会自然变成“在大文件中继续追加 if、模板字符串、兼容字段、事件名和状态判断”。本计划目标是在不改变用户可见行为的前提下，先切开边界，再逐步收束领域语义。

---

## 2. 重构目标

### 2.1 直接目标

1. 降低 `assets/app.js` 的职责密度。
2. 降低 `lib/team-snapshot.js` 的职责密度。
3. 统一任务/subagent 状态语义，避免前后端漂移。
4. 将 Hana 核心协议、bus handler、URL 参数、postMessage 等隐式协议集中封装。
5. 增强 snapshot 的能力诊断，区分“无数据”和“依赖不可用”。
6. 保持插件行为稳定，避免大重写。

### 2.2 非目标

本轮计划不追求：

- 引入 React/Vue/Svelte 等前端框架。
- 改变 UI 视觉设计。
- 改变插件 ID `team-observatory`。
- 改变核心终止路径 `/api/task/:taskId/abort`。
- 做发布版本升级或 release zip。
- 大规模重写 Hana plugin runtime 交互方式。

---

## 3. 当前架构问题清单

### 3.1 前端单文件职责过重

`assets/app.js` 同时承担：

- i18n 文案与 `t()`。
- localStorage 设置。
- API URL 拼接与 fetch 包装。
- snapshot refresh 与轮询。
- SSE 连接。
- dashboard/widget/chat 渲染。
- avatar cache。
- scroll restore。
- disclosure 状态记忆。
- terminate action。
- DOM event binding。
- iframe resize postMessage。
- subagent status 判断。

风险：新增 UI 或 action 时，需要同时触碰状态、模板、事件、API、平台协议，回归面持续扩大。

### 3.2 领域状态语义前后端重复

后端存在：

```js
normalizeTaskStatus()
isActiveStatus()
isFailedStatus()
isFinalStatus()
```

前端存在：

```js
observedSubagentStatus()
canTerminateSubagent()
subagentStats()
statusLabel()
```

已见漂移例子：

- 后端 active 包含 `paused`，前端 active/terminable 没有 `paused`。
- 后端 failed 包含 `cancelled`，前端主要使用 `canceled`。
- 后端统一 `resolved/completed/success`，前端局部兼容。

风险：统计、颜色、终止按钮、健康判断之间出现轻微但难发现的不一致。

### 3.3 Hana 核心协议散落

散落协议包括：

- bus handler：`agent:list`、`task:list`、`usage:list`、`session:list`、`session:history`、`session:send`。
- bus event：`deferred_result`、`token_usage`、`llm_usage`、`block_update`、`session_*`、`agent-*`、`task:*`。
- core REST：`/api/task/:taskId/abort`、`/api/agents/:agentId/avatar`。
- iframe URL params：`token`、`agentId`、`hana-theme`、`sessionPath`。
- postMessage：`resize-request`、`ready`。

风险：Hana 核心接口变化时，插件可能静默降级为空数据，排查困难。

### 3.4 snapshot 聚合过厚

`lib/team-snapshot.js` 同时负责：

- bus 请求。
- session list 读取。
- task normalization。
- usage normalization。
- subagent run store 兼容。
- session title 文件读取。
- agent health。
- alerts。
- recommendations。
- diagnose tool 文本。
- dispatch prompt。

风险：旧数据兼容、领域计算、工具输出和核心 adapter 相互污染。

### 3.5 静默降级过多

当前 `safeBusRequest()` 会 debug log 后返回 fallback。优点是稳定；缺点是用户看到空结果时难以判断原因。

需要区分：

```text
真的没有数据
权限不足
核心 handler 缺失
handler 抛错
文件路径不可访问
旧 run store 不存在
session history 不可用
```

---

## 4. 目标架构

### 4.1 前端目标结构

第一阶段目标：不引入构建系统，继续使用 browser ES modules。

```text
assets/
  app.js                  # 入口：初始化、refresh、render 调度
  api.js                  # apiUrl/apiJson/pluginPath/core API wrappers
  i18n.js                 # I18N + t()
  state.js                # state 创建、本地设置读写
  status.js               # 前端状态语义，短期保留展示判断
  avatar.js               # avatar url/cache/warmup
  render-dashboard.js     # dashboard 渲染
  render-widget.js        # widget 渲染
  render-chat.js          # conversation panel 渲染
  scroll.js               # detail/chat scroll restore
  actions.js              # action map 与事件委托
  platform.js             # URL params/localStorage/postMessage adapter
  utils.js                # esc/timeAgo/compactPath 等通用小函数
  styles.css
```

第一刀不要全部拆完。建议先拆：

```text
assets/api.js
assets/status.js
assets/i18n.js
```

### 4.2 后端目标结构

```text
lib/
  team-snapshot.js        # orchestration only
  core-adapter.js         # Hana bus/core API adapter
  status.js               # task/subagent status domain
  task-normalizer.js      # task/run normalization
  subagent-runs.js        # subagent-runs.json 兼容读取
  sessions.js             # session title/path utilities
  usage.js                # usage normalization/grouping
  health.js               # health/alerts/recommendations/summary
  diagnose.js             # diagnose text output
  dispatch-prompt.js      # dispatch prompt construction
```

目标是让主流程接近：

```js
export async function buildTeamSnapshot(ctx, options = {}) {
  const config = readRuntimeConfig(ctx);
  const sources = await loadSnapshotSources(ctx, options);
  const normalized = normalizeSnapshotSources(sources, config);
  return projectTeamSnapshot(normalized, config, options);
}
```

### 4.3 路由目标结构

不必过度拆分。建议中期拆成：

```text
routes/api.js             # route wiring
routes/shell.js           # dashboard/widget shell and asset url
routes/assets.js          # static asset serving
routes/events.js          # SSE event stream
routes/chat.js            # subagent chat controller
```

如果觉得文件太多，也可只拆：

```text
routes/shell.js
routes/events.js
routes/api.js
```

---

## 5. 分阶段执行计划

## Phase 0：基线冻结与验证脚本

目标：在重构前建立可重复验证基线。

### 任务

- [ ] 确认工作树干净。
- [ ] 记录当前文件行数与关键功能。
- [ ] 建立最小 smoke 脚本或命令清单。
- [ ] 确认 dev reload 可用。

### 建议验证命令

```powershell
node --check assets/app.js
node -e "import('file:///D:/Hanako/Shiraha/Hana-Plugins/subagent-observatory/routes/api.js').then(()=>console.log('api import ok'))"
node -e "import('file:///D:/Hanako/Shiraha/Hana-Plugins/subagent-observatory/lib/team-snapshot.js').then(()=>console.log('team-snapshot import ok'))"
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

### 验收标准

- 插件能 reload。
- dashboard/widget 可打开。
- snapshot API 可返回 JSON。
- conversation panel 可开关。
- terminate 按钮仍调用 `/api/task/:taskId/abort`。

### 提交建议

```text
chore: document refactor baseline
```

---

## Phase 1：前端低风险拆分

目标：先减少 `assets/app.js` 的职责密度，不改行为。

### 1.1 拆 `assets/i18n.js`

迁移内容：

- `I18N`
- `loadLang`
- `setLang` 中不含 render 的部分，或保留 `setLang` 在 app 中，只导入 `I18N/t`。
- `t()`

推荐接口：

```js
export const DEFAULT_LANG = ...;
export function loadLang(storage = localStorage) { ... }
export function createTranslator(getLang) { ... }
```

低风险接口也可以简单些：

```js
export { I18N };
export function t(lang, key, vars = {}) { ... }
```

### 1.2 拆 `assets/api.js`

迁移内容：

- `apiUrl`
- `apiJson`
- `pluginPath`
- core abort wrapper
- avatar URL wrapper

推荐接口：

```js
export function createApiClient({ getCurrentUrl, pluginId }) {
  return {
    apiUrl,
    pluginPath,
    apiJson,
    getSnapshot,
    getSubagentChat,
    abortTaskLikeChatCard,
    agentAvatarUrl,
  };
}
```

关键注释必须保留：

```js
// Keep aligned with desktop SubagentCard: POST /api/task/:taskId/abort.
```

### 1.3 拆 `assets/status.js`

迁移内容：

- `subagentStats`
- `observedSubagentStatus`
- `lastUpdateAgeMs`
- `statusLabel` 可暂留 app，因为依赖 `t()`；或改为传入 translator。
- `canTerminateSubagent`
- status constants。

推荐接口：

```js
export const ACTIVE_STATUSES = new Set([...]);
export const FAILED_STATUSES = new Set([...]);
export const FINAL_STATUSES = new Set([...]);
export const TERMINABLE_STATUSES = new Set([...]);

export function normalizeStatus(status) { ... }
export function observedSubagentStatus(task, staleAfterMs) { ... }
export function canTerminateSubagent(task, staleAfterMs) { ... }
export function subagentStats(tasks, staleAfterMs) { ... }
```

### 1.4 事件绑定暂不大改

第一阶段不要同时改成事件委托，避免混合重构与行为变更。

### 验收标准

- `assets/app.js` 行数明显下降。
- UI 行为无变化。
- terminate 仍走 core endpoint。
- 语言切换、conversation panel 开关、scroll restore 不退化。
- `node --check` 全部通过。
- plugin dev reload 成功。

### 提交建议

```text
refactor(frontend): split api i18n and status helpers
```

---

## Phase 2：前端平台边界与事件委托

目标：让 `render()` 只关心渲染，平台协议集中封装。

### 2.1 新增 `assets/platform.js`

封装：

- localStorage 读写。
- URL params 读取。
- postMessage。
- resize ready 协议。

推荐接口：

```js
export function safeLoadSetting(key, fallback) { ... }
export function safeSaveSetting(key, value) { ... }
export function launchParams() { ... }
export function postHostMessage(type, payload) { ... }
export function requestResize(height) { ... }
export function postReadyOnce(state) { ... }
```

要求：

- localStorage 操作必须 try/catch。
- `postMessage('*')` 可以保留，但要集中注释原因：插件 iframe 宿主 origin 在本地/远程上下文可能不同。

### 2.2 事件绑定改 action map

从：

```js
root.querySelectorAll('[data-action]').forEach(...)
```

改为：

```js
const actions = {
  refresh: () => refresh(),
  selectSubagent: el => selectSubagent(el.dataset.taskId),
  toggleDetails: el => toggleDetails(el.dataset.taskId),
  toggleChat: el => toggleChatDetails(el.dataset.taskId),
  refreshChat: el => loadChatDetails(el.dataset.taskId, { force: true }),
  terminateSubagent: el => terminateSubagent(el.dataset.taskId),
  toggleSettings: () => toggleSettings(),
  toggleConversationPanel: () => setConversationPanelEnabled(!state.conversationPanelEnabled),
  setLang: el => setLang(el.dataset.lang),
};
```

并在初始化时只绑定一次：

```js
bindRootActions(root, actions);
```

注意：

- scroll listener 和 `details toggle` listener 可暂时保留 render 后绑定。
- `event.target.closest('[data-action]')` 要处理 SVG 内部点击。

### 验收标准

- 点击所有按钮行为不变。
- render 后按钮不会失效。
- 未知 action 可 debug log，不影响 UI。
- `bindActions` 明显变小或被替换。

### 提交建议

```text
refactor(frontend): isolate platform helpers and delegate actions
```

---

## Phase 3：后端状态语义收束

目标：让 snapshot 输出更稳定的领域字段，前端减少猜测。

### 3.1 新增 `lib/status.js`

迁移内容：

- `normalizeTaskStatus`
- `isActiveStatus`
- `isFailedStatus`
- `isFinalStatus`
- 新增 `isTerminableStatus`
- 新增 `displayStatusForTask` 或 `projectTaskStatus`

推荐接口：

```js
export const ACTIVE_STATUSES = new Set([...]);
export const FAILED_STATUSES = new Set([...]);
export const FINAL_STATUSES = new Set([...]);
export const TERMINABLE_STATUSES = new Set([...]);

export function normalizeTaskStatus(status) { ... }
export function isActiveStatus(status) { ... }
export function isFailedStatus(status) { ... }
export function isFinalStatus(status) { ... }
export function isTerminableStatus(status) { ... }
export function observedStatus(task, { now, staleAfterMs }) { ... }
```

### 3.2 snapshot 输出 display fields

在 normalized task/subagent 上增加：

```js
{
  status,
  observedStatus,
  isActive,
  isFailed,
  isFinal,
  canTerminate,
}
```

兼容要求：

- 保留原 `status` 字段。
- 前端先优先读取 `observedStatus/canTerminate`，没有时 fallback 到旧逻辑。

### 验收标准

- 前端统计、颜色、终止按钮与后端 status 语义一致。
- `paused/cancelled/resolved/success` 等边界状态明确处理。
- snapshot schema 增量兼容。

### 提交建议

```text
refactor(domain): centralize task status semantics
```

---

## Phase 4：后端 core adapter 与 capability 诊断

目标：集中 Hana bus/core 协议，并显式暴露依赖可用性。

### 4.1 新增 `lib/core-adapter.js`

推荐接口：

```js
export async function requestCapability(ctx, type, payload, fallback) { ... }
export async function listAgents(ctx) { ... }
export async function listTasks(ctx) { ... }
export async function listUsage(ctx, since, limit) { ... }
export async function listSessions(ctx, agentId) { ... }
export async function readSessionHistory(ctx, sessionPath, limit) { ... }
export async function sendSessionMessage(ctx, sessionPath, text) { ... }
```

返回结构建议：

```js
{
  available: true,
  value,
  error: null,
}
```

handler 缺失：

```js
{
  available: false,
  value: fallback,
  error: "handler missing: usage:list",
}
```

### 4.2 snapshot 增加 capabilities

新增字段：

```js
capabilities: {
  agents: { available, error },
  tasks: { available, error },
  usage: { available, error },
  sessions: { available, error },
  runStore: { available, source, error },
}
```

前端可以先不展示，只供诊断。

### 验收标准

- 无数据和不可用可以区分。
- 原 UI 不退化。
- diagnose tool 可在 details 中返回 capability 摘要。

### 提交建议

```text
refactor(backend): add core adapter and snapshot capabilities
```

---

## Phase 5：拆分 `lib/team-snapshot.js`

目标：把旧数据兼容、normalization、health、tool 文案拆开。

建议顺序：

### 5.1 拆 `lib/subagent-runs.js`

迁移：

- `readSubagentRunRecords`
- `subagentRunStoreCandidates`
- `normalizeSubagentRunRecords`
- `mergeSubagentRuns`
- `isVisibleSubagentRun`
- `isArchivedSessionPath`

保留注释：

- 为什么读取 `HANAKO_HOME`、`OPENHANAKO_HOME`、`~/.hanako`。
- 为什么从 `ctx.dataDir/ctx.pluginDir` 向上扫描。
- 为什么 archived session 过滤。

### 5.2 拆 `lib/sessions.js`

迁移：

- `buildSessionTitleMap`
- `buildSessionOwnerMap`
- `attachParentSessionTitles`
- `attachSubagentDispatcherMetadata`
- `inferAgentIdFromSessionPath`
- `readSessionTitleFromFile`
- `sessionTitleFileCandidates`
- `contentText`
- `pathKey`

### 5.3 拆 `lib/usage.js`

迁移：

- `normalizeUsage`
- `groupUsageByAgent`
- `emptyUsageBucket`
- `sumUsage`
- `formatTokenCount`

### 5.4 拆 `lib/health.js`

迁移：

- `buildAgentStatus`
- `buildSummary`
- `buildAlerts`
- `computeHealth`
- `buildAgentRecommendations`
- `severityRank`

### 5.5 拆 tools 文案

迁移：

- `diagnoseAgent` -> `lib/diagnose.js`
- `buildDispatchPrompt` -> `lib/dispatch-prompt.js`

### 验收标准

- `team-snapshot.js` 只保留主 orchestration 和少量导出。
- 所有原有 tool import 路径更新。
- `api import ok`、`team-snapshot import ok`、tool scenario 通过。
- snapshot JSON 结构不破坏现有前端。

### 提交建议

按小步提交：

```text
refactor(snapshot): extract subagent run source
refactor(snapshot): extract session utilities
refactor(snapshot): extract usage aggregation
refactor(snapshot): extract health projection
refactor(tools): extract diagnose and dispatch builders
```

---

## Phase 6：路由拆分与错误格式稳定

目标：让 route wiring、shell、asset、SSE、chat controller 分离。

### 6.1 拆 shell/assets

新增：

```text
routes/shell.js
routes/assets.js
```

迁移：

- `renderShell`
- `assetUrl`
- `serveAsset`
- `escapeHtml`
- `escapeAttr`

### 6.2 拆 SSE

新增：

```text
routes/events.js
```

迁移：

- `/api/events` stream 创建逻辑。
- heartbeat/cleanup/safeSend。

### 6.3 拆 chat controller

新增：

```text
routes/chat.js
```

迁移：

- `/api/subagent-chat`
- `readSessionHistory`
- `normalizeHistoryMessage`
- `clampHistoryLimit`

### 6.4 统一 API 错误格式

推荐格式：

```js
{ error: { code: "TASK_ID_REQUIRED", message: "taskId is required" } }
```

前端 `apiJson` 兼容旧格式：

```js
const message = data?.error?.message || data?.error || data?.message || ...
```

### 验收标准

- 所有 route 路径不变。
- 错误格式向后兼容。
- SSE fallback 行为不变。
- subagent chat API 输出不变或增量兼容。

### 提交建议

```text
refactor(routes): split shell assets events and chat controllers
```

---

## Phase 7：测试与 fixture

目标：给关键兼容逻辑建立最小保护网。

不建议一开始引入复杂测试框架。先用 Node assert 建立 smoke tests。

### 建议目录

```text
tests/
  status.test.mjs
  subagent-runs.test.mjs
  snapshot-shape.test.mjs
  fixtures/
    subagent-runs-only.json
    task-registry-only.json
    merged-final-run.json
```

### 测试重点

- `normalizeTaskStatus()`：`resolved/completed/success/cancelled`。
- `isActiveStatus()`：`paused` 不遗漏。
- `mergeSubagentRuns()`：final run status 优先规则。
- `observedStatus()`：stale 判断。
- `apiJson()` 错误解析兼容旧/新格式。
- `pluginPath()` 使用 `data-plugin-id`，fallback 为 `team-observatory`。

### package 管理

当前仓库没有 `package.json`。可选：

1. 不新增 package，直接用 `node tests/status.test.mjs`。
2. 新增最小 `package.json`，但这会改变仓库形态，建议后置。

### 验收标准

- 本地 smoke tests 可单命令运行。
- CI 暂不要求。
- fixture 覆盖旧 run store 兼容路径。

### 提交建议

```text
test: add smoke coverage for status and run merging
```

---

## 6. 关键风险与控制策略

### 风险 1：ES module 拆分后插件静态资源加载失败

控制：

- 第一刀只新增少量模块。
- 使用相对 import：`import { ... } from './api.js'`。
- 确认 `/api/plugins/team-observatory/assets/api.js` 可被静态服务访问。
- 如当前 `routes/api.js` 只暴露 `app.js/styles.css`，需要同步让 assets route 支持白名单模块。

注意：当前 `routes/api.js` 只有：

```js
app.get("/assets/app.js", ...)
app.get("/assets/styles.css", ...)
```

所以 Phase 1 拆 ES modules 前，必须先扩展 asset serving。推荐新增白名单：

```js
const ASSET_ALLOWLIST = new Map([
  ["app.js", "text/javascript; charset=utf-8"],
  ["api.js", "text/javascript; charset=utf-8"],
  ["i18n.js", "text/javascript; charset=utf-8"],
  ["status.js", "text/javascript; charset=utf-8"],
  ["styles.css", "text/css; charset=utf-8"],
]);
```

### 风险 2：拆状态语义导致 UI 行为变化

控制：

- 先复制现有行为，再补齐遗漏状态。
- 对 `paused/cancelled/resolved` 做明确测试。
- snapshot 新字段增量输出，前端 fallback 旧逻辑。

### 风险 3：capability 诊断改变 snapshot shape

控制：

- 只增字段，不删字段。
- 前端初期不依赖 capability。
- diagnose tool 可先显示 details，不改正文。

### 风险 4：路由拆分导致路径变化

控制：

- route tests 或手工 `curl/fetch` 验证所有原路径。
- `registerSubagentObservatoryRoutes()` 对外签名不变。
- 每拆一个 route 文件就 reload 一次。

### 风险 5：重构跨度太大

控制：

- 每个 phase 可独立 commit。
- 每个 commit 不混合视觉调整和结构调整。
- 每步保留 rollback 点。

---

## 7. 验收矩阵

| 功能 | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 |
|---|---:|---:|---:|---:|---:|---:|---:|
| dashboard 打开 | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |
| widget 打开 | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |
| snapshot API | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |
| conversation panel 开关 | 必测 | 必测 | 必测 | 抽测 | 抽测 | 抽测 | 必测 |
| subagent chat 加载 | 必测 | 必测 | 必测 | 抽测 | 抽测 | 抽测 | 必测 |
| terminate core API | 必测 | 必测 | 必测 | 必测 | 必测 | 抽测 | 抽测 |
| language switch | 必测 | 必测 | 必测 | 抽测 | 抽测 | 抽测 | 抽测 |
| scroll restore | 抽测 | 必测 | 必测 | 抽测 | 抽测 | 抽测 | 抽测 |
| diagnose tool | 抽测 | 抽测 | 抽测 | 必测 | 必测 | 必测 | 抽测 |
| dispatch_review tool | 抽测 | 抽测 | 抽测 | 抽测 | 必测 | 必测 | 抽测 |
| dev reload | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |

---

## 8. 每阶段标准验证命令

PowerShell 环境下避免使用 Bash `&&`。建议：

```powershell
node --check assets/app.js
node -e "import('file:///D:/Hanako/Shiraha/Hana-Plugins/subagent-observatory/routes/api.js').then(()=>console.log('api import ok'))"
node -e "import('file:///D:/Hanako/Shiraha/Hana-Plugins/subagent-observatory/lib/team-snapshot.js').then(()=>console.log('team-snapshot import ok'))"
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

若新增前端模块，需要逐个检查：

```powershell
node --check assets/api.js
node --check assets/i18n.js
node --check assets/status.js
```

如果新增测试：

```powershell
node tests/status.test.mjs
node tests/subagent-runs.test.mjs
```

插件 reload：

```text
plugin_dev_reload pluginId="team-observatory" allowFullAccess=true
```

---

## 9. Git 策略

### 分支策略

当前可直接在 `main` 小步提交；如果一次拆分超过一个 phase，建议新建分支：

```text
refactor/subagent-observatory-structure
```

### 提交原则

- 一次提交只做一个结构变化。
- 不混合视觉 polish 和架构重构。
- 不在重构提交里改功能语义，除非 commit message 明确说明。
- 每次提交前 reload 插件。

### 推荐提交序列

```text
chore: add refactor plan
refactor(routes): allow modular frontend assets
refactor(frontend): split api helper
refactor(frontend): split i18n dictionary
refactor(frontend): split status helpers
refactor(frontend): isolate platform helpers
refactor(frontend): delegate action handling
refactor(domain): centralize task status semantics
refactor(backend): add core adapter capabilities
refactor(snapshot): extract subagent run source
refactor(snapshot): extract session utilities
refactor(snapshot): extract usage aggregation
refactor(snapshot): extract health projection
refactor(routes): split shell assets events and chat controllers
test: add smoke coverage for status and run merging
```

---

## 10. 回滚策略

每个 phase 都必须独立可回滚。

### 快速回滚

```powershell
git revert <commit>
```

### 如果 reload 后插件不可用

1. 立即查看 dev diagnostics。
2. 如果是模块加载 404，优先检查 asset route allowlist。
3. 如果是 import error，优先 `node --check` 和 Node dynamic import。
4. 如果是 UI 空白，浏览器 console 检查 module load error。
5. 无法 10 分钟内定位，revert 当前 commit。

### 不允许的回滚方式

- 手动删除大段代码但不还原结构。
- 在破损状态继续叠补丁。
- 未验证 reload 就继续下一 phase。

---

## 11. 建议立即执行的最小下一步

推荐先做一个很小的提交：

1. 新增本计划书。
2. 修改 `routes/api.js` 的 asset serving，使后续 ES module 拆分可行。
3. 不拆任何逻辑。
4. 验证 reload。
5. commit。

然后再做 Phase 1：

```text
拆 api.js -> 验证 -> commit
拆 i18n.js -> 验证 -> commit
拆 status.js -> 验证 -> commit
```

这样每一步都能回滚，不会把插件拖入半重构状态。

---

## 12. 成功标准

重构完成后，代码应满足：

- `assets/app.js` 降到约 300-450 行，只保留入口和编排。
- `lib/team-snapshot.js` 降到约 150-250 行，只保留 snapshot 主流程。
- 状态语义只有一个后端权威定义，前端展示尽量消费 snapshot 字段。
- Hana 核心 bus/core API 访问集中在 adapter 层。
- snapshot 能暴露 capability/error diagnostics。
- route 文件不再混合 shell、assets、SSE、chat controller。
- 每个 phase 都有可运行验证命令。
- 插件用户可见行为保持稳定。
