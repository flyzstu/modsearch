<p align="center">
  <img src="https://raw.githubusercontent.com/flyzstu/modsearch/main/assets/banner.jpg" width="100%" alt="ModSearch" />
</p>

<h1 align="center">ModSearch</h1>

<p align="center"><b>在官方 App 里模型能联网，切到 API 就不能了。ModSearch 把联网补回来：网页搜索、X 搜索、单页抓取。免费，免注册，免 API key。</b></p>

<p align="center">🥇 <b>全网最强的 DeepSeek Harness (dsh) 免费联网搜索插件</b> 🥇</p>

<p align="center">引擎：<b>Firecrawl</b>（免注册，默认）· <b>AnySearch</b>（结构化搜索/批量/正文提取）· <b>Antigravity CLI</b> · <b>Ollama Cloud</b> · <b>Brave</b> · <b>Tavily</b> · <b>Exa</b> · <b>Grok（X）</b> · <b>local</b>，自动故障转移</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="docs/troubleshooting.zh-CN.md">故障排查</a> ·
  <a href="skills/modsearch/references/configure.zh-CN.md">配置</a> ·
  <a href="skills/modsearch/references/output-schema.zh-CN.md">输出契约</a> ·
  <a href="docs/security.zh-CN.md">安全</a>
</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/@liustack/modsearch?style=flat-square" alt="Node.js"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/tests-532%20passed-brightgreen?style=flat-square" alt="Tests">
</p>

> [!NOTE]
> **关于本项目与上游分叉（Fork & Divergence）**：  
> 本项目 **Fork 自上游 [`liustack/modsearch`](https://github.com/liustack/modsearch)**。由于上游仓库不接收外部 Pull Request，本项目已与上游产生分叉并独立持续演进。  
> **主要增强特性**：
> - ✨ **AnySearch 深度集成**：完整继承 anysearch-dsh 全部特性（垂直领域检索、并发批量搜索、领域能力发现、无缝网页提取与 DSH 原生扩展）。
> - ✨ **Ollama Cloud 深度集成**：原生对接 Ollama 官方 REST API，同时支持网页搜索（`web_search`）与云端网页提取（`web_fetch`，含 SSRF 防护）。
> - ✨ **Brave Search 深度集成**：支持 Brave Search API（每月 2,000 次免费搜索）、422 Key 校验拦截与 429 智能熔断。
> - ✨ **多密钥轮换与体检**：全引擎支持逗号分隔多 Key 自动故障转移，`doctor` 离线体检全量支持。
> - ✨ **开放共建**：欢迎社区开发者提交 Issue 和 Pull Request！

DeepSeek 和 GLM 等模型没有联网能力或联网能力羸弱。ModSearch 通过外挂方式大幅增强模型联网搜索、X 搜索、单页抓取能力。装完即用：默认引擎是 Firecrawl 的免注册通道，[每月 1,000 免费 credits](https://www.firecrawl.dev/blog/firecrawl-keyless-launch)，不用注册账号，不用 API key，不用绑卡；同时深度集成 **AnySearch**（支持结构化搜索、并发批量检索与正文提取）、**Ollama Cloud**（Web Search & Fetch 双能力）与 **Brave Search**（每月 2,000 次免费搜索）等顶级引擎。

## 交流与反馈

遇到问题、有新的引擎需求或改进建议？欢迎在 GitHub 上[提交 Issue](https://github.com/flyzstu/modsearch/issues) 或发起 [Pull Request](https://github.com/flyzstu/modsearch/pulls)。

## 特性

- **🥇 全网最强的 DeepSeek Harness (dsh) 免费联网搜索插件：** 一条命令即刻安装 `npx -y @deepseek-ai/dsh plugin --profile web add @liustack/modsearch@5.11.0`。细节见[接入指南](docs/harness-setup.zh-CN.md#deepseek-harness-dsh)。
- **开箱免费，免注册。** 搜索和单页抓取默认跑在 Firecrawl 免注册通道上：[每月 1,000 免费 credits](https://www.firecrawl.dev/blog/firecrawl-keyless-launch)，没有账号、没有 API key、没有绑卡。后备通道也全部免费：Antigravity CLI 只需浏览器登录，AnySearch、Ollama Cloud、Brave、Tavily、Exa 和免费的 Firecrawl key 各带独立的额度，均不要求绑卡。
- **自动故障转移。** 一个通道失败或额度耗尽时自动切换下一个。
- **单引擎多密钥轮换。** AnySearch、Ollama、Brave、Tavily、Exa、Firecrawl 都可配置逗号分隔的多个密钥。鉴权、限流或配额失败时先轮换到下一个密钥，再按引擎链故障转移。
- **支持 AnySearch、Ollama Cloud 与 Brave Search。** 原生对接 AnySearch（结构化搜索、1-5 并发批量搜索、能力发现、网页正文提取）、Ollama Web Search & Fetch 官方 REST API 与 Brave Search API，支持结构化正文提取与安全过滤。
- **可搜索 X（推特）。** 安装 Grok Build 后，可检索网页索引覆盖不到的 X 内容。
- **一次安装，多端可用。** 支持 Claude Code、Codex、Pi、OpenCode。

## 实测

四张截图全部原样记录，前两张来自 Codex 桌面 App，后两张来自 dsh web，驱动的都是自身不能联网的 DeepSeek 模型。

给出一个博客链接，询问文章内容。25 秒后返回全文的结构化摘要，全程未打开浏览器。

![不能联网的 DeepSeek 通过 ModSearch 总结博客链接](https://raw.githubusercontent.com/flyzstu/modsearch/main/assets/demo-codex-fetch.png)

不指定目标，只问「今天有什么有趣的 AI 新闻」。36 秒后返回六条带来源的结果，并在结尾说明哪些信息来自检索聚合、细节可能有出入。该提醒来自 `uncertainty` 字段。

![开放问题返回六条带来源的结果，并附可信度说明](https://raw.githubusercontent.com/flyzstu/modsearch/main/assets/demo-codex-search.png)

在 dsh web 里问今天有哪些重要的 AI 新闻。dsh 原生的搜索工具行直接跑在 modsearch 引擎链上，18 秒返回三条当日消息，每条带来源链接。

![dsh web 的原生搜索跑在 modsearch 引擎链上，返回三条带来源的当日新闻](https://raw.githubusercontent.com/flyzstu/modsearch/main/assets/demo-dsh-web-search.zh-CN.png)

问 Node.js 现在哪条版本线还在维护。`read_page` 先后读官网版本页和发布计划表，59 秒给出结论和版本状态表，来源附在结尾。

![read_page 读取两个页面后给出 Node.js 维护线结论](https://raw.githubusercontent.com/flyzstu/modsearch/main/assets/demo-dsh-web-fetch.zh-CN.png)

## 支持的引擎

Firecrawl 零配置直接可用，其余引擎各一条命令。key 存在 `~/.modsearch/config.json`（0600 权限，展示时打码）：

| 引擎 | 能做什么 | 免费额度 | 怎么开 |
| :-- | :-- | :-- | :-- |
| Firecrawl（默认） | 网页搜索 + 单页抓取 | 免注册每月 1,000 免费 credits。注册免费 key 再得独享的每月 1,000 | 无需任何操作，装完即用 |
| AnySearch | 网页搜索 + 批量搜索 + 网页正文提取 | 公共免 Key 体验 / API Key 独立配额 | `modsearch config set anysearch.apiKey <key>` |
| Antigravity CLI | 网页搜索 + 单页抓取 | 免费，浏览器登录 | 安装 `agy` 并登录 |
| Ollama | 网页搜索 + 单页抓取 | 免费 key，需 Ollama 账号 | `modsearch config set ollama.apiKey <key>` |
| Brave | 网页搜索 | 每月 2,000 次请求，不绑卡 | `modsearch config set brave.apiKey <key>` |
| Tavily | 网页搜索 | 每月 1,000 credits，不绑卡 | `modsearch config set tavily.apiKey <key>` |
| Exa | 网页搜索 | 每月 $10 循环额度（约 1,400 次），不绑卡 | `modsearch config set exa.apiKey <key>` |
| Grok Build | X（推特）搜索 | 随 SuperGrok 或 X Premium 订阅 | 安装 `grok` 并登录 |
| local | 单页抓取 | 内置，零安装 | 无需任何操作 |

key 也可以走环境变量（`ANYSEARCH_API_KEY`、`OLLAMA_API_KEY`、`BRAVE_API_KEY`、`TAVILY_API_KEY`、`EXA_API_KEY`、`FIRECRAWL_API_KEY`）。同一引擎可在配置文件或环境变量中写入逗号分隔的多个 key，例如 `key-one,key-two`。配了多个引擎就自动故障转移，好的优先。每个引擎默认都参与，可以用 `modsearch config set anysearch.enabled false` 排除一个。想用 AnySearch、Ollama、Brave、Tavily、Exa、Firecrawl 兼容的第三方或自建端点？把引擎指过去即可：`modsearch config set anysearch.baseURL <url>`。官方地址始终内置在代码里，不会作为默认配置写入文件。每个引擎的全部配置项见[配置指南](skills/modsearch/references/configure.zh-CN.md)。

## 安装

**第一步，交给你的 AI。** skill 一装好，搜索和单页抓取就跑在 Firecrawl 的免注册免费额度上，所以安装只是一句话：

> 按 https://github.com/flyzstu/modsearch 的 INSTALL.md 安装并配置 modsearch skill，完成后运行体检并把结果告诉我。

**第二步（可选），再加免费引擎。** Antigravity CLI 的综述质量更高，AnySearch、Ollama、Brave、Tavily、Exa 或免费 Firecrawl key 能在免注册额度之上再加一份个人额度，都不要求绑卡。只有 agy 的浏览器登录需要你亲手完成：

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
agy                                                           # 浏览器完成登录后退出
```

选了 key 的话，发一句话给 AI 即可：「把我的 anysearch key 设成 ...」、「把我的 ollama key 设成 ...」或「把我的 brave key 设成 ...」。

dsh 用户还有一条不碰命令行的路。设置页的「插件 → 插件配置」里有一张 ModSearch 卡片：选首选引擎、填 API 密钥和自建接口地址、勾选哪些引擎参与故障转移，点保存就生效。

![dsh 设置页里的「搜索引擎（ModSearch）」配置卡片：选首选引擎、填 API 密钥与接口地址、勾选参与故障转移的引擎](https://raw.githubusercontent.com/flyzstu/modsearch/main/assets/demo-dsh-settings-card.jpg)

## 用法

装好之后不需要记任何命令。正常聊天，提出需要查证的问题或给出一个链接，skill 自动触发：选引擎、跑搜索或抓取，答案带着来源回来。

## 文档

| 文档                                                     | 适用场景                                    |
| :------------------------------------------------------- | :------------------------------------------ |
| [INSTALL.md](INSTALL.md)                                 | 一步步安装 skill（为 agent 编写）           |
| [CLI 手册](skills/modsearch/references/cli.zh-CN.md)           | skill 所驱动的 CLI：参数、配置与体检        |
| [故障排查](docs/troubleshooting.zh-CN.md)                      | 命令报错，查成因和解法                      |
| [配置手册](skills/modsearch/references/configure.zh-CN.md)     | 配置 key、切换引擎、排查配置                |
| [输出契约](skills/modsearch/references/output-schema.zh-CN.md) | 解析 JSON 或构建下游工具                    |
| [dsh 插件](docs/dsh.zh-CN.md)                                | 安装、配置、验证与更新原生 dsh bundle       |
| [宿主接入](docs/harness-setup.zh-CN.md)                        | 在 Codex、Claude Code、OpenCode、Pi 中配置  |
| [安全说明](docs/security.zh-CN.md)                             | SSRF 防护、DNS 重绑定防护、不可信输入的处理 |
| [更新日志](CHANGELOG.md)                                 | 查询版本变更                                |

GitHub 等站点被 Steam++ / Watt Toolkit、VPN 指到本机或保留地址导致抓取被拦？见[私有网络目标被拦](docs/troubleshooting.zh-CN.md#私有网络目标被拦)。

## 参与贡献

本项目欢迎所有开发者参与共建！

- **[提交 Issue](https://github.com/flyzstu/modsearch/issues)**：提出 Bug 反馈、新引擎支持建议或文档改进。
- **[提交 Pull Request](https://github.com/flyzstu/modsearch/pulls)**：欢迎提交代码改进与功能扩展。

## 免责声明

ModSearch 以 MIT 许可发布，使用不受限制。本项目不对任何用途（含商业使用）提供保证与背书。上游引擎（AnySearch、Ollama、Brave、Antigravity CLI、Tavily、Exa、Firecrawl、Grok Build）各有自己的条款与额度，遵守这些约束由使用者负责。

## License

MIT
