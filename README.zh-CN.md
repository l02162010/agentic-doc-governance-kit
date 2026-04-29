# Agentic Doc Governance Kit（简体中文）

> ⚠️ 本文档为社区翻译版本，**英文 README 才是唯一权威与最新来源**：[`README.md`](./README.md)。

这是一个面向 AI 代理的软件项目文档治理工具包，用于建立可复用、可验证、可追溯的文档与功能生命周期流程。

## 快速开始

```bash
node bin/agentic-doc-governance.mjs init /path/to/your-project
# 或（npm 发布后）：
npx agentic-doc-governance-kit init /path/to/your-project
```

初始化后可在目标仓库执行：

```bash
node scripts/docs-integrity-check.mjs --check-generated
node scripts/skills-integrity-check.mjs
node scripts/agent-closeout-check.mjs --feature FEAT-001
```

## 重点

- 提供文档治理与功能生命周期的标准结构。
- 内置检查器（docs / skills / closeout）。
- 支持 `feature add` 与 `feature status` 等 CLI 流程。

完整且最新说明（含全部参数、示例、限制与行为）请以英文版为准：[`README.md`](./README.md)。
