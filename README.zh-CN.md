# OpenFDE: AI workspace for FDEs

[English](./README.md) | **简体中文** | [日本語](./README.ja.md) | [Español](./README.es.md)

> **以 100 倍速度交付 AI 解决方案。** 访谈变成记忆，记忆变成可追踪的任务，任务交给 coding agent 执行——由 eval 把关。

**OpenFDE** 是为 FDE（Forward Deployed Engineer）打造的本地优先 AI 工作台。它把 engagement 材料——访谈、聊天记录、文档、PDF、图片——编译成本体支撑的运营记忆，并让人和 coding agent 形成闭环：agent 从 ledger 认领任务、拉取上下文包、执行并回写发现——客户管理层实时看到进展，每条结论都有出处。

![openfde 笔记界面](./docs/notes-ui.png)

## 为什么需要它

FDE 的工作状态散落在三个脆弱的地方：

- **知识在对话里。** 谁信任哪个数据源、决策为什么这样做、哪条约束卡住了流程——会上说过一次，两周后就找不回来。
- **任务在脑子里。** 从"访谈里听到要做什么"到"派给 coding agent"之间没有系统、没有上下文、没有溯源链。
- **验收在感觉里。** Agent 的产出靠感觉接受，而不是靠 eval。

OpenFDE 把这三样变成一个系统，从记忆开始。

## OpenFDE 做什么

- **本体支撑的运营记忆（ontology-backed operational memory）。** 固定的 FDE 领域本体——目标、业务流、决策、约束、数据源、痛点——约束抽取过程，进入 ledger 的是运营知识而非散文。点线面透镜（价值面 → 业务流 → 决策点）按管理层的思维方式组织记忆。
- **强制溯源的上下文管理（context management）。** 你对 agent 能读到什么拥有完全的权限与可见性：engagement 级隔离、每条事实带原文引用、上下文包永远以约束开头。
- **闭环的 agent 运作（closed-loop operation）。** Coding agent 通过同一把 CLI 认领任务、拉取上下文、执行、回写结果——持续反馈回路：上一步的输出成为下一步的输入（记忆 → 任务 → 发现 → 记忆）。没有任何动作静默落地：工作以可评审的状态迁移返回，全程审计。
- **人在环审查与治理（human-in-the-loop review）。** 任务状态机把关验收；分享按能力域限定且只读；eval 门禁验收——rubric 作为版本化资产——在路线图上。

## 能力

- **本地优先。** 每个 engagement 一个 SQLite 目录（`~/.openfde/engagements/<slug>/`）。客户数据不出本机；交接一个项目就是移交一个目录。
- **出处是强制的，不是建议。** 没有来源 URI 的内容在写入时直接拒绝。每条检索结果都能展开到逐字原文。
- **双时间轴记忆。** 矛盾的事实做失效替代而非删除。`recall --mode handoff` 回放完整时间线——包括你当时相信什么、后来被什么取代。
- **读路径无 LLM——多路混合检索 + 排名融合。** recall 将多路检索器（事实 BM25 词法、实体图扩展）用倒数排名融合（RRF）合并，再叠加时间衰减与失效惩罚、按来源封顶——不信任任何单一打分器。原始 episode 落地即可关键词检索（先于抽取），错误串等字面量永远能精确命中。全程毫秒级；LLM 只在写入侧工作，且受固定领域本体约束。
- **Agent 原生。** 所有命令支持 `--json`。在 agent 指令里加几行，它就能在任务中查询记忆、认领任务、回写发现。
- **FDE 作战工具箱。** 带引用的联网调研（`research`）、隔天 demo 简报（`demo`）、rubric 验收判分（`eval`）、git 就绪的资产库（`asset`）、数据谈判地图（`datamap`）。
- **可追溯的任务（agent-pull 派发）。** 任务卡存在 ledger 里，带状态机和审计事件流；`openfde context <task>` 组装弹药包——约束置顶、相关记忆随后、全部带引用。
- **Markdown 为主、Obsidian 风格的工作区，四个顶层 tab。** `openfde serve` 打开本地界面：**Note**（每个实体、episode、任务都是一篇 Markdown 笔记——分层树、[[双链]]、行内引用，外加与 CLI 投影一一对应的视图）、**Ontology**（确定性分层布局的实体图）、**Todo**（任务状态机之上的看板——拖卡片即转移状态，非法转移被拒绝）、**Canvas**（自由 Markdown 卡片画布，承载结构化之前的思考）。人用工作区，agent 用 CLI。
- **自动抽取的流程图。** `openfde flows` 把工作流事实变成 mermaid 流程图——目标、步骤、依赖、阻塞约束、已有的自动化——在工作区（以及 GitHub 上）内联渲染，每条边都对应一条有出处的事实。文字解释实体，流程图解释过程。

  ![openfde 流程图](./docs/flows-ui.png)

- **Notion 风格的页面。** 与账本并存的自由 Markdown 文档，在工作区里按块编辑——点击即编辑，`/` 插入标题、列表、代码、mermaid 图或新页面——agent 通过 `openfde page` 读写同一批文件。
- **给客户老板的高管报告——实时的。** `/report` 渲染一页浅色可打印的报告，用图谱回答四个问题：能接手什么、减负多少、取代什么、价值多少——缺数字的地方自动生成量化问题。`openfde share` 生成局域网只读链接，agent 干活时页面实时更新，并带实时进展流。

  ![openfde 高管报告](./docs/report-ui.png)

## 快速开始

```sh
pnpm install

# 1. 记忆：访谈进来，带引用的事实出去
pnpm openfde engagement create "acme corp"
pnpm openfde ingest ./notes/interview.md --kind message --speaker 王工
pnpm openfde extract               # 需要 ANTHROPIC_API_KEY；离线用 --mock
pnpm openfde recall 对账
pnpm openfde recall 数据源 --mode handoff   # 含失效事实的时间线

# 2. 派发：记忆变成可追踪的工作
pnpm openfde task create "自动化 CSV 清理" --criteria "无人值守运行" --source "interview://onsite#pain-csv"
pnpm openfde task claim <id> && pnpm openfde context <id>   # agent 开工前跑的两步

# 3. 给老板看
pnpm openfde report                # Markdown 输出
pnpm openfde serve                 # 工作区 :4517，可打印报告在 /report
```

## CLI

| 命令 | 作用 |
| --- | --- |
| `openfde engagement create/list/use` | 管理 engagement（一个客户项目一个本地目录） |
| `openfde ingest <files…>` | 摄取材料为 episode，出处必填——文本、Markdown、**PDF 和图片**（经 Claude 原生抽取） |
| `openfde extract` | 本体约束抽取 + 两阶段消解（去重 / 失效替代） |
| `openfde recall <query>` | 检索记忆；`--mode handoff` 看时间线；`--json` 给 agent |
| `openfde remember <fact> --source <uri>` | 记录任务中发现的新知识（agent 回写） |
| `openfde whoknows <topic>` | 谁是某主题的专家——按记录在案的归属、决策、提及排序，附引用证据 |
| `openfde task create/list/claim/start/done/accept` | 可追溯的任务卡：状态机 + 审计事件流（agent-pull 派发） |
| `openfde context <task>` | 组装任务的记忆弹药包：约束 + 相关事实，全部带引用 |
| `openfde status` | 当前 engagement 的记忆概况 |
| `openfde research <query>` | 联网搜索方法与实践，带来源引用；`--save` 把发现摄取进记忆 |
| `openfde demo <topic>` | 从记忆组装 demo 简报——客户的痛点、词汇、约束、数据形状，直接交给 coding agent（"demo 就是销售"） |
| `openfde eval <task> --input <file>` | 按任务 rubric 判分提交的工作；裁决进审计流并沉淀 eval 数据集 |
| `openfde asset add/list/show` | 资产库：rubric（建任务时自动生成）、prompt、eval 用例、demo、playbook、skill——文件形态，git 就绪 |
| `openfde datamap` | 数据谈判地图：每个数据源谁拥有、谁信任、什么依赖它 |
| `openfde canvas show/add` | Engagement 的自由卡片画布（在 webui 的 Canvas tab 里拖拽编辑） |
| `openfde flows` | 自动抽取的 mermaid 流程图：目标、工作流、步骤、阻塞、自动化——每条边都是有出处的事实 |
| `openfde page add/list/show/edit/remove` | 与账本并存的自由 Markdown 页面；工作区里按块编辑，agent 可脚本化读写 |
| `openfde interview` | 从图谱缺口生成访谈指南——自上而下（价值→业务流→决策点，老板场）或自下而上（知识挖掘线索） |
| `openfde report` | 高管版 engagement 报告：机会、减负、自动化覆盖、价值——每条结论带引用 |
| `openfde serve` | 本地笔记 + 图谱工作区，另有可打印的高管报告页 `/report`（可选守护进程，CLI 不依赖它） |
| `openfde share` | 在局域网内用不可猜测的链接分享实时只读高管报告——老板实时看进展；其余一切仍只对本机开放 |

## Agent 集成

人用 Web 工作区；**agent 用 CLI，以 skill 形态安装**：

```sh
cp -r skills/openfde ~/.claude/skills/openfde     # 用户级
# 或：cp -r skills/openfde .claude/skills/openfde  # 项目级
```

[`skills/openfde/SKILL.md`](./skills/openfde/SKILL.md) 写清了 CLI 本身的安装方法和完整作业环路（找活 → 认领 → 拉上下文 → 执行 → 回写 → eval）。任何能跑 shell 的 agent 都能用——没有协议层，不需要配置。

## 仓库结构

```
packages/ontology   FDE 领域本体（Zod，单一事实源）
packages/core       Ledger：engagement / 记忆 / 派发 / 投影 / 报告
packages/webui      可选本地工作区（笔记 + 图谱 + 视图 + 高管报告）
skills/openfde      Agent skill：CLI 的安装与用法
apps/cli            openfde 命令（人和 agent 共用入口）
```

模块地图与未来模块的落点见 [ARCHITECTURE.md](./ARCHITECTURE.md)（英文）。

## 开发

```sh
pnpm test                 # vitest
pnpm typecheck
pnpm -C apps/cli build    # 打包 CLI（含工作区界面）
```

## 路线图

- **Dispatch orchestrated 模式** —— agent-pull 已交付（`openfde task` + `openfde context`）；下一步是可选 runner，自动对 `ready` 任务在隔离 git worktree 中派发 agent
- **资产晋升与杠杆度量** —— engagement 级资产库已交付（任务标准自动生成 rubric、eval 用例数据集、demo 简报）；下一步：脱敏晋升到团队仓库 + 跨 engagement 杠杆指标（合同额上升、单次部署人力下降）
- **运营写回** —— 今天记录决策 lineage（`task accept --outcome`）；明天把 action loop 闭合到客户系统
