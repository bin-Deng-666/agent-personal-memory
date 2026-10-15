# Agent Personal Memory

[![Verify](https://github.com/bin-Deng-666/agent-personal-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/bin-Deng-666/agent-personal-memory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Pi 与 Claude Code 共用的个人记忆库。**

保留有价值的背景、经历、目标、想法和合作习惯，让它们延续到下一次对话。两端直接读写同一份本地记录，保留用户原话，在提供建议时按需检索。可以只使用其中一端，也可以同时使用，无需在两个记忆库之间导入或同步。

[English](README.md) · [操作指南](docs/usage.md) · [数据与隐私](docs/privacy.md)

## 安装

需要 **Node.js 22+**，支持 macOS、Linux。已验证 Pi **1.2.0** 和 Claude Code **2.1.295**；其他宿主版本和 Windows 尚未验证。

### Pi

```sh
pi install git:github.com/bin-Deng-666/agent-personal-memory
```

执行 `/reload` 或重启 Pi，然后打开 `/memory`。

### Claude Code

在 Claude Code 中执行：

```text
/plugin marketplace add bin-Deng-666/agent-personal-memory
/plugin install agent-personal-memory@agent-personal-memory
```

重启 Claude Code，然后打开 `/agent-personal-memory:memory`。插件自带运行文件，无需安装 Pi 或运行 npm。两端分别使用各自已配置的模型和凭据。

使用过原版 Pi Personal Memory 的用户请参考[原版升级说明](docs/usage.md#upgrading-the-original-pi-package)。每端保留一份扩展即可，已有记录继续原地使用。

## 共用一个记忆库

新安装默认使用 `~/.local/share/agent-personal-memory/`，支持 `XDG_DATA_HOME`。如果存在原来的 `~/.pi/agent/memory/` 记忆库，两端会共同使用它，不复制数据，也不需要后台同步服务。

需要明确指定位置时，在两端的启动环境中设置同一个绝对路径：

```sh
export PERSONAL_MEMORY_DIR="$HOME/.local/share/agent-personal-memory"
```

已有记忆时请指定原目录。修改这个变量只会选择目录，不会移动记录。[目录选择与自定义 Pi 配置](docs/usage.md#shared-library-location)说明了完整优先级与迁移行为。

任一端保存的记录，会在另一端下一次读取时可见。两端使用相同的进程锁、去重和版本检查；删除记录和 Memory On/Off 开关也共同生效。

## 记忆包含什么

| 类别       | 适合保留的个人信息                   |
| ---------- | ------------------------------------ |
| 个人背景   | 持续的责任、工作条件、能力与现实约束 |
| 个人经历   | 重要事件、当时的选择、自述感受与影响 |
| 目标与方向 | 正在追求或认真探索的方向             |
| 观点与想法 | 值得继续讨论的原则、认识和灵感       |
| 稳定偏好   | 长期适用的合作习惯与重要取舍         |

提取规则要求内容有未来用途、忠实于原意，并排除项目进度、单次格式要求、助手建议和无依据的人格判断。记忆正文与会话标题保留原语言，界面操作使用英文。

普通对话加载合作习惯；其他类别在 Advice 中按问题检索。日常收录遵循静默规则，两端共用证据校验和写入条件。

## Library、Extraction 与 Advice

两端使用相同的三个页面与操作顺序。

**Library** 用于搜索和管理记忆。详情操作依次为 **Edit → Original words → Delete → Back**。Edit 只有 **Content、Type**，修改前展示当前值，其他字段保留。Original words 显示用户原话、消息日期，以及可用的来源宿主。

**Extraction** 列出 Pi 和 Claude Code 的历史会话，每行显示宿主、原标题与扫描状态：**○ Not extracted**、**✓ Extracted**、**↻ Updated**。可选择单个会话，也可通过 **Select conversations** 批量提取。每个会话由独立后台 agent 执行提取与复核；两端均可查看进度、已保存记忆、日志，取消任务或重试。提取完成但新增零条记忆也是正常结果。

**Advice** 将问题带回主对话，按需检索相关记忆并对照依据。Pi 提供 `Question │ …` 输入框；Claude Code 也可以直接使用 `/agent-personal-memory:advice <问题>`。

主菜单提供 Memory On/Off。关闭后会阻止自动写入、停止新的检索并取消正在进行的提取；Library 仍可用于用户主动管理。

### 两端的界面与操作

|                  | Pi                 | Claude Code                     |
| ---------------- | ------------------ | ------------------------------- |
| 打开记忆         | `/memory`          | `/agent-personal-memory:memory` |
| 页面导航         | 全屏终端面板       | 命令引导的原生选择界面          |
| 选择与返回       | 方向键、Enter、Esc | Claude Code 原生操作            |
| 开关             | Tab                | Memory On/Off 菜单项            |
| 状态             | 底栏显示数量       | 菜单显示相同状态文字            |
| 自动保存工具显示 | 扩展隐藏           | 由 Claude Code 控制             |

Claude Code 管理自己的屏幕、快捷键和工具显示。插件通过原生选择界面尽量保持 Pi 的导航和操作名称，并保留用户原有的 Claude Code 状态栏。非交互运行中使用同样的文字选项。

## 质量与模型用量

每条来源引文都必须匹配原始用户消息。历史提取还会使用独立的新模型上下文，复核候选的未来用途、原意、适用条件、确定性和重复情况；历史纠正按原话日期判断。两端使用相同的提取和复核规则。

模型判断仍可能出错。重要记录可以通过 **Original words** 对照依据并修改。历史复核会增加模型用量，大批量提取可能受到提供方限流。Claude Code 提取通过独立、无工具且关闭 hooks 的 `claude -p` 进程运行，沿用其已有认证；Pi 提取使用已配置的模型与独立 Pi 会话。

## 数据与控制

记忆与任务文件以本地明文保存。插件没有遥测或托管服务；执行请求的宿主会将必要的会话片段和记忆发送给自身配置的模型提供方。

删除记忆会移除主记录，并抑制同一证据的自动恢复；原始对话、日志和备份中仍可能保留文本。卸载会保留共享记忆库。完整存储、清理行为及 Claude Code 的上下文限制见[数据与隐私](docs/privacy.md)。

## 参与开发

```sh
git clone https://github.com/bin-Deng-666/agent-personal-memory.git
cd agent-personal-memory
npm ci --ignore-scripts
npm run verify
```

修改 `src/` 后，使用 `npm run build:claude` 重建已提交的独立 Claude 运行文件。验证涵盖类型、格式、模块依赖、运行文件是否过期、共享存储、双端适配和打包安装。测试使用合成数据与本地模拟服务；安装了 Claude Code 时，可额外运行 `node scripts/check-claude-host.mjs`，验证真实宿主中的插件发现、hooks 与 MCP 调用。

[贡献指南](CONTRIBUTING.md) · [代码结构](docs/architecture.md) · [反馈问题](https://github.com/bin-Deng-666/agent-personal-memory/issues/new/choose) · [安全报告](SECURITY.md)

## 许可证

[MIT](LICENSE)。
