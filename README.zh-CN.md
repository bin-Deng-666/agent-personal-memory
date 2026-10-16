# Agent Personal Memory

[![Verify](https://github.com/bin-Deng-666/agent-personal-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/bin-Deng-666/agent-personal-memory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**为 Pi 保留离开当前任务后，仍有价值的个人信息。**

Agent Personal Memory 是 [Pi](https://github.com/earendil-works/pi) 的个人记忆扩展，记录有意义的背景、经历、目标、想法和合作习惯。日常收录静默进行，记录保留用户原话；通过 `/personal-memory` 全屏面板查看、修改和删除。

[English](README.md) · [操作指南](docs/usage.md) · [数据与隐私](docs/privacy.md) · [代码结构](docs/architecture.md)

## 安装

需要 **Node.js 22+**。已在 macOS、Linux 上验证 **Pi 1.2.0**；其他 Pi 版本和 Windows 尚未验证。

```sh
pi install git:github.com/bin-Deng-666/agent-personal-memory
```

执行 `/reload` 或重启 Pi，然后打开：

```text
/personal-memory
```

扩展使用 Pi 已配置的模型和凭据，运行依赖由 Pi 自动安装。无需独立账号、记忆服务或构建步骤。

每次保留一份安装即可。个人记忆位于源码之外，更新时继续原地使用。也可以通过 `pi install /绝对路径/agent-personal-memory` 安装本地目录。

## 什么值得保存

| 类别       | 有个人价值的信息                         |
| ---------- | ---------------------------------------- |
| 个人背景   | 持续的责任、工作条件与现实约束           |
| 个人经历   | 重要事件、当时的选择、自述感受及影响     |
| 目标与方向 | 认真追求或探索的方向，保留条件和不确定性 |
| 观点与想法 | 超出一次任务、值得继续讨论的原则和认识   |
| 稳定偏好   | 明确长期适用的合作习惯与重要取舍         |

判断标准是：**当前任务结束后，这条信息是否仍能帮助理解用户，或给出更合适的建议？** 重要经历、实际尝试、个人约束和整体看法，即使来自项目讨论也可以保留。具体选择也可以提炼为“先验证再投入”“倾向复用公共能力”等有依据的原则，但必须保留情境和当前倾向，不能写成普遍人格。文件改动、参数、开发排期、排错进度和单次格式要求不直接收录。

项目讨论中仍可能包含重要的个人经历。保存的是用户明确表达的选择、感受和持续条件，并保留时间、范围与探索程度，不补写动机、不泛化成人格标签。没有合格内容时，零保存就是正确结果。

**自动收录覆盖五类；普通对话只预加载合作习惯；Advice 根据问题检索其他相关记录。**

## 使用 `/personal-memory`

面板由 Pi 直接打开，无需等待模型请求。方向键选择，Enter 打开，Esc 返回，**Tab** 切换 Personal Memory On/Off。

### Library：查看和管理

搜索已有记忆，每条结果明确显示分类。宽窗口会在右侧显示选中记录的预览。详情操作依次为 **Edit、Original words、Delete、Back**。

Edit 只有 **Content、Type**，切换时展示原值；正文编辑器预填旧内容，分类选择器默认选中原分类。Original words 展示用户原话和消息日期。

选择 **Organize all memories**，或按 **Ctrl+O**，用当前 Pi 模型检查整个记忆库。预览会展示建议合并的记录与改写前后内容；选择 **Apply organization** 后才在一次版本检查事务中应用。所有原话和日期都会保留；不同事实、冲突观点和不同条件应分开。Esc 可取消。

### Extraction：从历史对话提取

历史会话有三种扫描状态：**○ Not extracted、✓ Extracted、↻ Updated**。可以选择单个会话，也可以通过 **Select conversations** 批量处理。每个会话由独立后台进程执行提取，并在新模型上下文中单独复核。

提取过程中可以返回主对话继续聊天。打开会话可查看进度、已保存记忆、日志，取消任务或重试。没有符合价值和证据要求的新内容时，提取完成也可能新增零条记录。

### Advice：基于相关记忆提问

在 **`Question │ …`** 中输入问题，面板关闭后回到主对话。Pi 按问题检索相关记忆并对照原话；提示规则要求保留时间、范围和不确定性，区分用户陈述与助手分析。

底栏显示 `Personal Memory On · 1 total · 1 habit loaded`，多个习惯使用 `habits`。关闭后会阻止自动写入和新的检索，在下一次模型请求中移除记忆上下文与工具，并取消提取任务；用户主动进行的 Library 管理仍可使用。

## 质量与模型用量

历史提取与复核由独立 Pi 会话执行，通过阶段专用工具提交结构化结果。工具检查字段和来源 ID；复核必须覆盖每个候选，并给出个人价值判断、支持原话和具体未来用途。协调层核对原始证据、范围、重复和版本后，worker 才写入。普通文本不作为提取结果解析；无效提交只给予有限次数的纠错机会，批次结构异常不会推进 checkpoint。即时收录使用同一套价值规则与证据检查，每轮最多自动写入三条。

[记忆质量与评估](docs/extraction-quality.md)说明了具体边界。`npm run evaluate:quality -- <provider> <model-id>` 可选用真实模型评估写作、学习、职业选择、家庭责任、软件工作和投资等合成样例，会消耗模型额度并产生临时任务文件，不读取或写入真实个人记忆库。

这些检查能减少错误，但不能证明每条复述都准确。重要记录应通过 **Original words** 对照。历史复核会增加模型用量，较大的批次可能受到提供方限流。静默显示不会消除模型延迟，也不能保证所有模型始终不提保存过程。

## 数据与控制

默认记忆库为 **`~/.pi/agent/memory/`**。自定义 Pi agent 目录会改变对应位置，也可以通过 `PERSONAL_MEMORY_DIR` 指定其他绝对路径。已有受支持的记忆库会原地使用，不自动复制或合并。

文件为本地明文，使用进程锁、版本检查和事务日志处理并发与恢复。扩展没有遥测或托管后端；必要的对话片段与记忆仍会发送给你配置的模型提供方。

删除记忆会移除主记录，并抑制同一证据的自动恢复；原始会话、任务文件和备份仍可能保留文本。卸载会保留个人记忆。完整行为见[数据与隐私](docs/privacy.md)。

## 更新与卸载

```sh
pi update git:github.com/bin-Deng-666/agent-personal-memory
pi remove git:github.com/bin-Deng-666/agent-personal-memory
```

之后执行 `/reload` 或重启 Pi。Pi 只有一个自定义底栏位置，其他同样替换底栏的扩展可能影响显示。

## 开发

```sh
git clone https://github.com/bin-Deng-666/agent-personal-memory.git
cd agent-personal-memory
npm ci --ignore-scripts
npm run verify
```

Pi 直接加载 TypeScript 入口。验证包含格式、严格类型、源码引用与分层检查、行为及界面测试，以及仅安装运行依赖的打包检查。测试使用临时目录、合成数据和本地模型服务。

[贡献指南](CONTRIBUTING.md) · [代码结构](docs/architecture.md) · [反馈问题](https://github.com/bin-Deng-666/agent-personal-memory/issues/new/choose) · [安全报告](SECURITY.md)

## 许可证

[MIT](LICENSE)。
