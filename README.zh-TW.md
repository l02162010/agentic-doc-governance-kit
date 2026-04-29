# Agentic Doc Governance Kit（繁體中文）

> ⚠️ 本文件為社群翻譯版本，**以英文版 README 為唯一權威與最新來源**：[`README.md`](./README.md)。

AI 代理文件治理套件，用於在軟體專案中建立可重複、可驗證、可追溯的文件與功能生命週期流程。

## 快速開始

```bash
node bin/agentic-doc-governance.mjs init /path/to/your-project
# 或（npm 發佈後）：
npx agentic-doc-governance-kit init /path/to/your-project
```

初始化後可在目標專案執行：

```bash
node scripts/docs-integrity-check.mjs --check-generated
node scripts/skills-integrity-check.mjs
node scripts/agent-closeout-check.mjs --feature FEAT-001
```

## 內容重點

- 提供文件治理與功能生命週期的標準結構。
- 內建檢查器（docs / skills / closeout）。
- 支援 `feature add` 與 `feature status` 等 CLI 流程。

如需完整與最新說明（含所有旗標、範例、限制與行為），請以英文版為準：[`README.md`](./README.md)。
