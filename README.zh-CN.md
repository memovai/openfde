# openfde

[English](./README.md) | **简体中文** | [日本語](./README.ja.md) | [Español](./README.es.md)

> 把客户访谈变成记忆，把记忆变成可追踪的任务，把任务交给 coding agent 执行——由 eval 把关。

**openfde** 是为 FDE（Forward Deployed Engineer，前沿部署工程师）打造的本地优先 engagement 记忆系统。把访谈纪要、聊天记录、文档倒进来，它会抽取成结构化、可引证、带时间线的知识图谱——你和你的 coding agent 通过同一把 CLI 查询它。

![openfde 笔记界面](./docs/notes-ui.png)

## 为什么需要它

FDE 的工作状态散落在三个脆弱的地方：

- **知识在对话里。** 谁信任哪个数据源、决策为什么这样做、哪条约束卡住了流程——会上说过一次，两周后就找不回来。
- **任务在脑子里。** 从"访谈里听到要做什么"到"派给 coding agent"之间没有系统、没有上下文、没有溯源链。
- **验收在感觉里。** Agent 的产出靠感觉接受，而不是靠 eval。

openfde 把这三样变成一个系统，从记忆开始。

## 特性

- **本地优先。** 每个 engagement 一个 SQLite 目录（`~/.openfde/engagements/<slug>/`）。客户数据不出本机；交接一个项目就是移交一个目录。
- **出处是强制的，不是建议。** 没有来源 URI 的内容在写入时直接拒绝。每条检索结果都能展开到逐字原文。
- **双时间轴记忆。** 矛盾的事实做失效替代而非删除。`recall --mode handoff` 回放完整时间线——包括你当时相信什么、后来被什么取代。
- **读路径无 LLM。** 全文检索（含 CJK 逐字切分）加一跳图扩展，毫秒级返回。LLM 只在写入侧工作，且受固定领域本体约束。
- **Agent 原生。** 所有命令支持 `--json`。在 agent 指令里加一行，它就能在任务中查询 engagement 记忆。
- **Markdown 为主、Obsidian 风格的工作区。** `openfde serve` 打开本地界面：每个实体和 episode 都是一篇 Markdown 笔记——分层树、实体间 [[双链]]、行内引用溯源；力导向图作为伴生视图（点击节点即打开笔记）。

  ![openfde 图视图](./docs/graph-ui.png)

## 快速开始

```sh
pnpm install
pnpm openfde engagement create "acme corp"
pnpm openfde ingest ./notes/interview.md --kind message --speaker 王工
pnpm openfde extract               # 需要 ANTHROPIC_API_KEY；离线用 --mock
pnpm openfde recall 对账
pnpm openfde recall 数据源 --mode handoff   # 含失效事实的时间线
pnpm openfde serve                 # 图谱界面 http://localhost:4517
```

## CLI

| 命令 | 作用 |
| --- | --- |
| `openfde engagement create/list/use` | 管理 engagement（一个客户项目一个本地目录） |
| `openfde ingest <files…>` | 摄取材料为 episode，出处必填 |
| `openfde extract` | 本体约束抽取 + 两阶段消解（去重 / 失效替代） |
| `openfde recall <query>` | 检索记忆；`--mode handoff` 看时间线；`--json` 给 agent |
| `openfde remember <fact> --source <uri>` | 记录任务中发现的新知识（agent 回写） |
| `openfde task create/list/claim/start/done/accept` | 可追溯的任务卡：状态机 + 审计事件流（agent-pull 派发） |
| `openfde context <task>` | 组装任务的记忆弹药包：约束 + 相关事实，全部带引用 |
| `openfde status` | 当前 engagement 的记忆概况 |
| `openfde report` | 高管版 engagement 报告：机会、减负、自动化覆盖、价值——每条结论带引用 |
| `openfde serve` | 本地笔记 + 图谱工作区，另有可打印的高管报告页 `/report`（可选守护进程，CLI 不依赖它） |

## Agent 集成

在你的 `CLAUDE.md` / `AGENTS.md` 里加上：

```
用 `openfde recall <query> --json` 查询客户 engagement 记忆。
领任务：`openfde task list --status ready --json`，然后
`openfde task claim <id>`，开工前先 `openfde context <id>`。
用 `openfde remember "<fact>" --source <uri>` 记录新发现。
用 `openfde task update <id> --note "..."` 汇报进展；完成用 `openfde task done <id>`。
```

就这些——任何能跑 shell 的 agent 都能使用 FDE 记忆。没有协议层，不需要配置。

## 仓库结构

```
packages/ontology   FDE 领域本体（Zod，单一事实源）
packages/core       Ledger：engagement / 摄取 / 抽取 / 消解 / 检索
apps/cli            openfde 命令（人和 agent 共用入口）
```

模块地图与未来模块的落点见 [ARCHITECTURE.md](./ARCHITECTURE.md)（英文）。

## 开发

```sh
pnpm test                 # vitest
pnpm typecheck
pnpm -C apps/cli build    # 打包 CLI（含图谱界面）
```

## 路线图

- **Dispatch orchestrated 模式** —— agent-pull 已交付（`openfde task` + `openfde context`）；下一步是可选 runner，自动对 `ready` 任务在隔离 git worktree 中派发 agent
- **内建 Eval 的资产库** —— prompt、rubric、eval 数据集都是版本化资产；评估消费 rubric 资产，并把分数与新用例回流资产库
- **资产晋升** —— 在 engagement 中沉淀的模式经脱敏后晋升复用
