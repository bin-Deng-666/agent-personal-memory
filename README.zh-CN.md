# Agent Personal Memory

[![Verify](https://github.com/bin-Deng-666/agent-personal-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/bin-Deng-666/agent-personal-memory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**保留离开当前任务后，仍有价值的个人信息。**

Agent Personal Memory 为 **Pi** 和 **Claude Code** 提供独立安装包，两端共同读写同一个本地记忆库。保存有意义的背景、经历、目标、想法和合作习惯，保留用户原话，并支持查看、修改和删除。

[English](README.md) · [Pi 安装指南](docs/pi.md) · [Claude Code 安装指南](docs/claude-code.md) · [数据与隐私](docs/privacy.md)

## 按宿主安装

需要 Node.js 22+，支持 macOS、Linux。已验证 Pi 1.2.0、Claude Code 2.1.295；其他宿主版本和 Windows 尚未验证。

### Pi：在终端执行

```sh
pi install git:github.com/bin-Deng-666/agent-personal-memory
```

执行 `/reload` 或重启 Pi，然后使用 `/personal-memory`。Git 安装入口指向 `packages/pi/`；独立 Pi 包不包含 Claude 的 hooks、命令或 MCP 服务。[Pi 安装、升级与操作 →](docs/pi.md)

### Claude Code：在 Claude Code 内执行

```text
/plugin marketplace add bin-Deng-666/agent-personal-memory
/plugin install agent-personal-memory@agent-personal-memory
```

重启后执行 `/agent-personal-memory:setup`，配置 `/personal-memory`、状态栏和启动器。安装 tmux 后，退出 Claude，在原终端执行 `~/.claude/bin/personal-memory-claude`；再输入 `/personal-memory`，就会在当前窗口上方打开真正的终端面板，关闭后返回原对话。Claude 自带的 `/memory` 保持原样。marketplace 只安装 `packages/claude-code/`，无需 Pi 或 npm。[Claude Code 配置、更新与操作 →](docs/claude-code.md)

## 什么值得保存

| 类别       | 有个人价值的信息                         |
| ---------- | ---------------------------------------- |
| 个人背景   | 持续的责任、工作条件与现实约束           |
| 个人经历   | 重要事件、当时的选择、自述感受及影响     |
| 目标与方向 | 认真追求或探索的方向，保留条件和不确定性 |
| 观点与想法 | 超出一次任务、值得继续讨论的原则和认识   |
| 稳定偏好   | 明确长期适用的合作习惯与重要取舍         |

判断标准是：**当前任务结束后，这条信息是否仍能帮助理解用户，或给出更合适的建议？** 项目功能要求、界面选择、安装方式、临时排错现象和单次回答要求应被排除。删除项目名不能把任务要求变成个人偏好；要求谨慎判断一次错误，也不能据此推断用户性格谨慎。

项目中的个人经历仍可能有价值，例如用户明确描述的感受、选择或长期工作条件。保存的是有原话依据的个人意义，不补写动机、不泛化成人格标签。没有合格候选时，零保存就是正确结果。

**自动收录覆盖五类；普通对话只预加载合作习惯；Advice 按问题检索其他相关记录。** `habits loaded` 表示上下文加载数量，不表示只能保存习惯。

## 同一个记忆库

新安装默认使用 `~/.local/share/agent-personal-memory/`，支持 `XDG_DATA_HOME`。存在原来的 `~/.pi/agent/memory/` 时，两端共同原地使用。也可在两端的启动环境中，将 `PERSONAL_MEMORY_DIR` 设为同一个绝对路径；这个变量选择目录，不会自动移动数据。

两端共用记录 ID、证据规则、去重、进程锁、版本检查、删除抑制和 On/Off 设置。任一端写入后，另一端下次读取即可看到，不运行额外复制或同步服务。[目录选择与共享行为 →](docs/usage.md)

## Library、Extraction、Advice

- **Library**：搜索列表明确显示分类。详情依次提供 **Edit、Original words、Delete、Back**。Edit 只有 **Content、Type**，修改前展示原值。适用范围保留为内部信息，不单独显示 Applies to。
- **Extraction**：选择 Pi 或 Claude 会话，状态为 **○ Not extracted、✓ Extracted、↻ Updated**。每个会话由独立后台 agent 执行提取及单独复核，两端共用进度、结果、日志、取消与重试。
- **Advice**：在主对话中围绕问题检索记忆及其证据，保留时间、适用条件和探索程度，区分用户说过的事实与助手分析。

状态统一为 `Personal Memory On · N total · N habits loaded`，单数使用 `1 habit`。关闭后阻止自动写入和新的检索，并取消正在运行的提取；用户主动进行的 Library 管理仍可使用。

Pi 在内部显示全屏面板；Claude 通过 **tmux 在当前窗口显示弹层**，共用相同的列表、预览、编辑器和键盘组件，菜单操作不再依赖模型生成。Claude 状态栏保留原输出，并追加共享记忆数量。需要使用 setup 提供的启动器开启 Claude，或原本就在 tmux 中运行；普通启动方式也能显示状态，但不能承载弹层。[界面对照 →](docs/usage.md)

## 质量、费用与隐私

逐字证据校验和保守规则会拦截明显的项目要求、无依据的服务或域名，以及无依据的人格评价。历史提取还使用独立的新模型上下文复核。检查能减少错误，但不能证明每条复述都准确；重要记录仍应通过 **Original words** 对照。

模型请求使用各宿主配置的提供方与凭据。复核增加模型用量，批量提取可能受到限流。记忆和任务文件为本地明文，插件没有遥测或托管服务；必要的会话与记忆仍会发送给所配置的模型提供方。

删除会移除主记录，原始对话、任务文件和备份可能保留文本；卸载保留记忆库。Claude 不能撤回已注入的上下文，关闭会禁用工具并更新指令；需要干净上下文时请 `/clear` 或开启新会话。[数据、保留与清理 →](docs/privacy.md)

## 文件结构与开发

```text
packages/
  core/          共用记忆格式、收录规则、历史解析、检索和存储
  terminal/      共用主页、列表、预览、编辑器和独立终端运行器
  pi/            Pi 适配、终端界面和独立安装包
  claude-code/   Claude hooks、MCP 工具、命令和独立安装包
```

```sh
git clone https://github.com/bin-Deng-666/agent-personal-memory.git
cd agent-personal-memory
npm ci --ignore-scripts
npm run verify
```

修改 `packages/*/src/` 后执行 `npm run build`。提交的宿主运行文件包含共用核心，使用者无需构建。验证包含类型、格式、宿主依赖边界、构建结果、共享存储、界面测试和两个独立包的安装检查。另有真实 Claude 进程的本地模拟提供方检查，以及使用已配置模型、独立测试库的五类自动收录验证。

[贡献指南](CONTRIBUTING.md) · [代码结构](docs/architecture.md) · [反馈问题](https://github.com/bin-Deng-666/agent-personal-memory/issues/new/choose) · [安全报告](SECURITY.md)

## 许可证

[MIT](LICENSE)。
