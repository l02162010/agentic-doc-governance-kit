# Agentic Doc Governance Kit（日本語）

> ⚠️ この文書はコミュニティ翻訳です。**唯一の正本かつ最新情報は英語版 README** です：[`README.md`](./README.md)。

AI エージェント主導のソフトウェア開発向けに、ドキュメント統制と機能ライフサイクルを標準化するためのキットです。

## クイックスタート

```bash
node bin/agentic-doc-governance.mjs init /path/to/your-project
# または（npm 公開後）：
npx agentic-doc-governance-kit init /path/to/your-project
```

初期化後、対象リポジトリで次を実行します：

```bash
node scripts/docs-integrity-check.mjs --check-generated
node scripts/skills-integrity-check.mjs
node scripts/agent-closeout-check.mjs --feature FEAT-001
```

## ポイント

- ドキュメント統制と機能ライフサイクルの標準構成を提供。
- 組み込みチェッカー（docs / skills / closeout）。
- `feature add` / `feature status` などの CLI ワークフローを提供。

詳細かつ最新の説明（全オプション、例、制約、挙動）は英語版を参照してください：[`README.md`](./README.md)。
