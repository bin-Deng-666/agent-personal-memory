# Pi Personal Memory

[![Verify](https://github.com/bin-Deng-666/pi-personal-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/bin-Deng-666/pi-personal-memory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

让有价值的个人信息，延续到下一次 [Pi](https://github.com/earendil-works/pi) 对话。

Pi Personal Memory 从你分享的内容中保留重要背景、经历、目标、想法和稳定偏好，保存原话依据，在后续讨论中按需使用。日常收录静默进行，你可以通过 `/memory` 查看和管理记忆。

[English](README.md) · [操作指南](docs/usage.md) · [数据与隐私](docs/privacy.md)

## 安装

需要 **Node.js 22+** 和 **`@earendil-works/pi-coding-agent` 1.2.0**。已在 macOS、Linux 验证；其他 Pi 版本和 Windows 尚未验证。

```sh
pi install git:github.com/bin-Deng-666/pi-personal-memory
```

已有会话执行 `/reload`，然后打开：

```text
/memory
```

插件使用 Pi 已配置的模型和凭据，运行依赖由 Pi 自动安装。请保留一份插件安装；使用过手动复制版本的用户可参考[迁移说明](docs/usage.md#installation-and-updates)。

## 记忆包含什么

一条有用的记忆应保留足以在未来理解的背景：发生了什么、你重视什么、当时处于什么阶段，以及哪些条件影响了选择。

| 类别       | 适合保留的内容                           |
| ---------- | ---------------------------------------- |
| 个人背景   | 持续的责任、工作条件、能力与现实约束     |
| 个人经历   | 重要事件、当时的选择、自述感受和后续影响 |
| 目标与方向 | 正在追求或认真探索的方向                 |
| 观点与想法 | 值得继续讨论的原则、认识和灵感           |
| 稳定偏好   | 长期适用的合作习惯与重要取舍             |

提取规则要求内容有个人价值、复述忠实，并排除项目进度、单次格式要求和无依据的人格判断。记忆正文和会话标题保留原语言，界面操作使用英文。

普通对话加载合作习惯；其他个人记忆在 Advice 中按问题检索。底栏显示记忆总数和选入上下文的合作习惯数量，启动 Pi 时会恢复这些习惯。

## 使用记忆

### Library：查看与管理

搜索、阅读、修改和删除已有记忆。输入文字进入搜索，上下键选择结果，Enter 打开；当前输入区域和列表项都有高亮。

详情页提供 **Edit、Original words、Delete、Back** 四个操作。Edit 内只有 **Content、Type**，切换时预览当前值；正文编辑器预填旧内容，分类选择器默认选中原分类。Original words 展示支撑该记忆的用户原话和消息日期。

### Extraction：从历史对话提取

提取列表显示会话总数，每行展示状态和会话标题：

| 状态                               | 含义                     |
| ---------------------------------- | ------------------------ |
| ○ Not extracted · 蓝色／主题强调色 | 尚未完成提取             |
| ✓ Extracted · 绿色                 | 消息与上次完成扫描时一致 |
| ↻ Updated · 黄色                   | 上次扫描后消息发生变化   |

上下键选择会话，Enter 开始提取或查看结果。需要批量处理时，使用 **Select conversations** 或 Ctrl+R；空搜索框下按 Space 标记，搜索时可用 Ctrl+Space，Enter 启动所选会话。

每个会话由独立后台 agent 处理，可以返回主对话继续聊天，稍后再查看进度。打开会话后可查看保存结果、日志、取消或重试。没有符合价值和证据要求的新内容时，提取完成也可能保存零条记忆。

### Advice：基于相关记忆提问

在 **`Question │ …`** 中输入问题，Enter 将问题带回主对话。回答会按问题检索相关记忆及其来源；提示规则要求区分用户陈述与助手分析，保留过去目标、探索状态和适用条件。

整个面板中，**Tab** 切换 Memory On/Off，**Esc** 返回上一层。详情操作使用左右键和 Enter，PgUp/PgDn 滚动正文。关闭 Memory 后会阻止自动写入、取消提取，并在下一次模型请求中移除记忆上下文。

## 记忆质量

历史提取先校验逐字引文，再通过独立模型请求复核候选的未来用途、原意、条件、确定性和重复情况。提取与复核使用各自的新上下文；一条记忆可以引用多条用户消息，历史纠正按原话日期判断。

模型判断仍可能出错。重要记录可以通过 **Original words** 对照依据并修正。即时收录在主对话中校验证据，额外的独立复核用于历史提取；复核会增加模型用量，较大的批次也可能受到提供方限流。

## 数据与控制

记录以本地明文保存在 **`~/.pi/agent/memory/`**，支持通过 `PI_CODING_AGENT_DIR` 指定 agent 目录。插件没有遥测或托管记忆服务；提取、复核和 Advice 会把必要的对话内容及记忆发送给你配置的模型提供方。

删除记忆会移除主存储记录，并抑制同一证据的自动恢复。原始 Pi 会话、提取任务文件和备份中仍可能保留文本，完整存储与清理行为见[数据与隐私](docs/privacy.md)。

## 更新与卸载

```sh
pi update git:github.com/bin-Deng-666/pi-personal-memory
pi remove git:github.com/bin-Deng-666/pi-personal-memory
```

安装变更后执行 `/reload` 或重启 Pi。卸载会保留个人记忆数据。插件使用 Pi 的自定义底栏位置，其他同样替换底栏的扩展可能影响其显示。

## 参与开发

```sh
git clone https://github.com/bin-Deng-666/pi-personal-memory.git
cd pi-personal-memory
npm ci --ignore-scripts
npm run verify
```

验证涵盖格式、类型、模块依赖、行为测试，以及仅安装运行依赖的打包安装检查。测试使用合成记录和本地模型服务；CI 覆盖 Node 22/24、Linux 和 macOS。

[贡献指南](CONTRIBUTING.md) · [代码结构](docs/architecture.md) · [反馈问题](https://github.com/bin-Deng-666/pi-personal-memory/issues/new/choose) · [安全报告](SECURITY.md)

## 许可证

[MIT](LICENSE)。
