# openfde

[English](./README.md) | [简体中文](./README.zh-CN.md) | **日本語** | [Español](./README.es.md)

> 顧客インタビューをメモリに、メモリを追跡可能なタスクに、タスクを coding agent の仕事に——eval がゲートする。

**openfde** は FDE（Forward Deployed Engineer）のためのローカルファーストなエンゲージメント・メモリシステムです。インタビューのメモ、チャットログ、ドキュメントを投入すると、構造化され、引用可能で、時間軸を持つナレッジグラフへと抽出します。人間も coding agent も、同じ CLI でこれを検索します。

![openfde ノート UI](./docs/notes-ui.png)

## なぜ必要か

FDE の作業状態は、3 つの壊れやすい場所に散らばっています：

- **知識は会話の中にある。** 誰がどのデータソースを信頼しているか、なぜその決定がなされたか、どの制約がワークフローを塞いでいるか——会議で一度語られ、2 週間後には失われます。
- **タスクは頭の中にある。** 「インタビューで聞いた」から「coding agent に依頼した」までの間に、システムも、コンテキストも、出典への追跡もありません。
- **検収は感覚の中にある。** Agent の成果物は eval ではなく雰囲気で受け入れられています。

openfde はこの 3 つを 1 つのシステムに変えます。まずはメモリから。

## 特長

- **ローカルファースト。** エンゲージメントごとに 1 つの SQLite ディレクトリ（`~/.openfde/engagements/<slug>/`）。顧客データはマシンの外に出ません。引き継ぎはディレクトリの受け渡しです。
- **出典は強制、推奨ではない。** ソース URI のないコンテンツは書き込み時に拒否されます。検索されたすべてのファクトは、元の逐語的な引用まで展開できます。
- **バイテンポラルなメモリ。** 矛盾するファクトは削除ではなく無効化で置き換えます。`recall --mode handoff` はタイムラインを再生します——当時何を信じていたか、何がそれを置き換えたかを含めて。
- **読み取りパスに LLM なし。** 全文検索（CJK 対応の文字分割つき）と 1 ホップのグラフ展開で、ミリ秒単位の応答。LLM は書き込み側でのみ、固定ドメインオントロジーの制約下で動作します。
- **Agent ネイティブ。** すべてのコマンドが `--json` に対応。Agent の指示に 1 行加えるだけで、タスク中にエンゲージメント・メモリを検索できます。
- **Markdown ファーストの Obsidian スタイル・ワークスペース。** `openfde serve` で開くローカル UI では、すべてのエンティティとエピソードが Markdown ノートです——階層ツリー、エンティティ間の [[wiki リンク]]、インラインの引用。力学グラフはコンパニオンビュー（ノードをクリックするとノートが開きます）。

  ![openfde グラフビュー](./docs/graph-ui.png)

## クイックスタート

```sh
pnpm install
pnpm openfde engagement create "acme corp"
pnpm openfde ingest ./notes/interview.md --kind message --speaker 田中
pnpm openfde extract               # ANTHROPIC_API_KEY が必要；オフラインは --mock
pnpm openfde recall 照合
pnpm openfde recall データソース --mode handoff   # 無効化済みファクトを含むタイムライン
pnpm openfde serve                 # グラフ UI: http://localhost:4517
```

## CLI

| コマンド | 説明 |
| --- | --- |
| `openfde engagement create/list/use` | エンゲージメント管理（顧客プロジェクトごとに 1 ディレクトリ） |
| `openfde ingest <files…>` | 資料をエピソードとして取り込み（出典必須） |
| `openfde extract` | オントロジー制約つき抽出 + 2 段階解決（重複排除 / 無効化置換） |
| `openfde recall <query>` | メモリ検索；`--mode handoff` でタイムライン；`--json` は agent 向け |
| `openfde remember <fact> --source <uri>` | タスク中に発見した知識を記録（agent の書き戻し） |
| `openfde task create/list/claim/start/done/accept` | 追跡可能なタスクカード：状態機械 + 監査イベントログ（agent-pull ディスパッチ） |
| `openfde context <task>` | タスク用のメモリ弾薬パックを組み立て：制約 + 関連ファクト、すべて引用つき |
| `openfde status` | 現在のエンゲージメントのメモリ概況 |
| `openfde report` | 経営層向けエンゲージメント・レポート：機会、負荷軽減、自動化カバレッジ、価値——すべての主張に引用つき |
| `openfde serve` | ローカルのノート + グラフ・ワークスペース。印刷可能な経営層向けレポート `/report` も提供（任意のデーモン。CLI は単体で動作） |

## Agent 連携

`CLAUDE.md` / `AGENTS.md` に追加：

```
顧客エンゲージメント・メモリの検索: `openfde recall <query> --json`
タスクの取得: `openfde task list --status ready --json` →
`openfde task claim <id>`、開始前に `openfde context <id>`
新しい発見の記録: `openfde remember "<fact>" --source <uri>`
進捗報告: `openfde task update <id> --note "..."`、完了: `openfde task done <id>`
```

これだけです。シェルを実行できる agent なら何でも FDE メモリを使えます。プロトコル層も設定も不要です。

## リポジトリ構成

```
packages/ontology   FDE ドメインオントロジー（Zod、単一の情報源）
packages/core       Ledger：エンゲージメント / 取り込み / 抽出 / 解決 / 検索
apps/cli            openfde コマンド（人間と agent の共通エントリポイント）
```

## 開発

```sh
pnpm test                 # vitest
pnpm typecheck
pnpm -C apps/cli build    # グラフ UI を含む CLI のバンドル
```

## ロードマップ

- **Dispatch の orchestrated モード** —— agent-pull は提供済み（`openfde task` + `openfde context`）。次は `ready` タスクに対して隔離 git worktree で agent を自動起動する任意の runner
- **Eval を内蔵したアセットライブラリ** —— プロンプト、ルーブリック、eval データセットはバージョン管理されたアセット。評価はルーブリック資産を消費し、スコアと新しいテストケースをライブラリに還流
- **アセット昇格** —— エンゲージメントで蓄積されたパターンを、匿名化のうえ再利用へ昇格
