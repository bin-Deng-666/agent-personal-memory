# Pi Personal Memory

为 [Pi](https://github.com/earendil-works/pi) 提供个人记忆：保留有价值的背景、经历、目标、想法和稳定偏好，以原话为依据，在需要时检索。

[English](README.md) · [操作说明](docs/usage.md) · [代码结构](docs/architecture.md) · [数据与隐私](docs/privacy.md)

## 安装

需要 **Node.js 22+**，目前验证的宿主为 **`@earendil-works/pi-coding-agent` 1.2.0**。面向 macOS、Linux；其他 Pi 版本和 Windows 尚未验证。

```sh
pi install git:github.com/bin-Deng-666/pi-personal-memory
```

已有会话执行 `/reload`，然后打开 `/memory`。运行依赖由 Pi 安装，模型和凭据使用 Pi 已有配置，无需单独账号或记忆服务。

如果以前手动放置过 `extensions/memory/`，先移走旧扩展，避免重复加载。记忆数据位于独立的 `memory/` 目录，不在插件源码中。

## 功能

- **静默保存**：自动保存有长期价值的个人信息，无确认队列，不显示保存通知或工具卡片。通过模型指令避免回复中讨论内部保存过程。
- **提取与复核**：每个选中的历史会话启动独立后台进程。先校验逐字引文，再用独立模型请求复核价值、复述准确性、适用条件、时间和确定性。
- **按需使用**：普通对话只加载合作习惯；经历、背景、目标、观点在 Advice 中按问题检索。
- **简单管理**：Library 只提供搜索、查看、修改和删除，无手动新增入口。
- **共享存储**：五类记录分别存文件，使用跨进程锁、版本检查和事务日志处理并发与恢复。
- **全局开关**：在 `/memory` 内按 Tab 切换；关闭后阻止自动写入、取消提取，下次模型请求移除记忆上下文。

## 使用

| 页面       | 内容             | 操作                                       |
| ---------- | ---------------- | ------------------------------------------ |
| Library    | 已有记忆         | 输入搜索、上下选择、Enter 打开             |
| Extraction | 历史会话与结果   | 上下选择、Enter 打开、Ctrl+R 批量选择      |
| Advice     | 基于相关记忆提问 | 在 `Question │ …` 输入，Enter 发送到主对话 |

当前输入区域、列表项、详情操作都有高亮。详情底部为 Edit、Original words、Delete、Back，左右键选择，Enter 执行。Edit 内只显示 Content、Type，两项之间空一行，宽窗口在右侧预览当前值；编辑正文自动填入旧内容，分类默认选中原分类。Tab 仅切换记忆开关；Esc 返回上一层。Memory 状态显示在路径行右侧，启动时从存储恢复合作习惯摘要，以同一份摘要计算 loaded 数量并构建后续请求。

提取列表不预览上下文正文，只显示总数与“状态 + 会话标题”：

- 蓝色／主题强调色 `○ Not extracted`：未完成提取。
- 绿色 `✓ Extracted`：与上次完成扫描的用户／助手消息一致。
- 黄色 `↻ Updated`：消息发生变化。

批量选择时，空搜索框下可按 Space 标记；搜索时用 Ctrl+Space 标记。每个会话启动一个独立 agent。打开会话查看进度、结果、重试和日志。提取完成但没有新增记忆也是正常结果。

## 质量、费用和边界

提取结果必须有真实用户原话。复述应保留时间、否定、适用条件和探索程度，不能把“考虑中”改成“已决定”，也不能把助手建议当用户事实。支持多条用户消息共同提供依据。历史纠正比较原话日期，不比较保存日期。

复核会增加模型请求、耗时与 token；批量提取可能触发提供方限流。提取和复核仍依赖模型判断，并不保证语义完全正确。重要记录可通过 Original words 对照原文。

即时保存通过主对话中的工具执行，有证据校验和提示规则，但没有历史提取那次独立复核。静默显示不意味着没有延迟，也不能保证所有模型始终不提保存过程。

## 数据

默认保存在 `~/.pi/agent/memory/`，支持 `PI_CODING_AGENT_DIR`。记录为本地明文。提取、复核和 Advice 会把必要的会话片段或记忆发送给你选择的模型提供方；插件没有遥测或自建后端。

删除记忆会移除主存储中的记录，并阻止同一证据自动恢复；原始 Pi 会话、提取日志等仍可能含有原文，详见[数据与隐私](docs/privacy.md)。

```sh
pi update git:github.com/bin-Deng-666/pi-personal-memory
pi remove git:github.com/bin-Deng-666/pi-personal-memory
```

卸载不删除个人记忆数据。

## 开发

```sh
git clone https://github.com/bin-Deng-666/pi-personal-memory.git
cd pi-personal-memory
npm ci --ignore-scripts
npm run verify
```

无需构建。验证包含格式、类型、模块引用、分层依赖、行为测试和打包安装检查。测试使用临时目录、合成数据和本地模型服务。源码职责与文件树见[架构说明](docs/architecture.md)，贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

[MIT License](LICENSE)。
