<p align="center">
  <img src="https://raw.githubusercontent.com/flyzstu/modsearch/main/assets/banner.jpg" width="100%" alt="ModSearch" />
</p>

<h1 align="center">ModSearch</h1>

<p align="center"><b>In official apps, models have web access; switch to an API and they lose it. ModSearch gives it back: web search, X search, and single-page fetch. Free out of the box: no signup, no API key.</b></p>

<p align="center">🥇 <b>The strongest free web search plugin for DeepSeek Harness (dsh)</b> 🥇</p>

<p align="center">Engines: <b>Firecrawl</b> (keyless, default) · <b>AnySearch</b> (search, batch & extract) · <b>Antigravity CLI</b> · <b>Ollama Cloud</b> · <b>Brave</b> · <b>Tavily</b> · <b>Exa</b> · <b>Grok (X)</b> · <b>local</b>, with automatic failover</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="docs/troubleshooting.md">Troubleshooting</a> ·
  <a href="skills/modsearch/references/configure.md">Configuration</a> ·
  <a href="skills/modsearch/references/output-schema.md">Output contract</a> ·
  <a href="docs/security.md">Security</a>
</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/@flyzstu/modsearch?style=flat-square" alt="Node.js"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/tests-532%20passed-brightgreen?style=flat-square" alt="Tests">
</p>

> [!NOTE]
> **Fork & Divergence Notice**:  
> This project is **forked from upstream [`liustack/modsearch`](https://github.com/liustack/modsearch)**. Because upstream does not accept community pull requests, this repository has diverged and is actively developed independently.  
> **Key Enhancements**:
> - ✨ **AnySearch Integration**: Full parity with anysearch-dsh (vertical search, concurrent batch fan-out, dynamic domain capabilities, and keyless/keyed clean web extraction).
> - ✨ **Ollama Cloud Integration**: Native integration with official Ollama REST APIs for both web search (`web_search`) and cloud page fetch (`web_fetch` with SSRF protection).
> - ✨ **Brave Search Integration**: Full support for Brave Search API (2,000 free queries/month), 422 key validation, and 429 cooldown failover.
> - ✨ **Multi-key Rotation & Enhanced Doctor**: Seamless failover across comma-separated keys and full offline diagnostics support.
> - ✨ **Open Community**: Open for Issues and Pull Requests!

Models like DeepSeek and GLM have no web access, or a weak one. ModSearch is a plug-in that greatly strengthens web search, X search, and single-page fetch. It works the moment it lands: the default engine is Firecrawl's keyless tier, [1,000 free credits every month](https://www.firecrawl.dev/blog/firecrawl-keyless-launch), with no account, no API key, and no card; with first-class support for **AnySearch** (search, batch & extract), **Ollama Cloud** (search & fetch) and **Brave Search** (2,000 free queries/month).

## Feedback & Community

Encounter a bug or want a new engine supported? Feel free to [open an issue](https://github.com/flyzstu/modsearch/issues) or submit a [Pull Request](https://github.com/flyzstu/modsearch/pulls).

## Features

- **🥇 The strongest free web search plugin for DeepSeek Harness (dsh):** one command installs it, `npx -y @deepseek-ai/dsh plugin --profile web add @flyzstu/modsearch@5.11.1`. Details in [harness setup](docs/harness-setup.md#deepseek-harness-dsh).
- **Free out of the box, no signup.** Search and page fetch run on Firecrawl Keyless by default: [1,000 free credits/month](https://www.firecrawl.dev/blog/firecrawl-keyless-launch), no account, no API key, no card. Every fallback channel is free too: Antigravity CLI needs only a browser sign-in, and AnySearch, Ollama Cloud, Brave, Tavily, Exa, and a free Firecrawl key each add their own quota with no card required.
- **Automatic failover.** When a channel fails or exhausts its quota, the next one takes over.
- **Per-engine key rotation.** Give AnySearch, Ollama, Brave, Tavily, Exa, or Firecrawl multiple comma-separated keys. Authentication, rate-limit, and quota failures rotate to the next key before the engine chain falls back.
- **Support for AnySearch, Ollama Cloud & Brave Search.** Native integration with AnySearch (structured search, 1-5 concurrent batch fan-out, dynamic domain capabilities, and clean markdown extract), official Ollama Web Search & Fetch REST APIs, and Brave Search API, with structured extraction and SSRF protection.
- **Searches X (Twitter).** With Grok Build installed, ModSearch queries the corpus that web indexes cannot reach.
- **Install once, use everywhere.** Works in Claude Code, Codex, Pi, and OpenCode.

## See it work

All four screenshots are unedited runs, the first two from the Codex desktop app and the last two from dsh web, driving DeepSeek models with no web access of their own.

Give it a blog link and ask what the post says. Twenty-five seconds later: a structured summary of the whole post, with no browser involved.

![Text-only DeepSeek summarising a blog link through ModSearch](https://raw.githubusercontent.com/flyzstu/modsearch/main/assets/demo-codex-fetch.png)

Give it no target at all, just "anything interesting in AI today?". Thirty-six seconds later: six sourced stories, with a closing note on which details came from aggregation and deserve a second look. The note comes from the `uncertainty` field.

![An open-ended question comes back as six sourced stories with a stated confidence caveat](https://raw.githubusercontent.com/flyzstu/modsearch/main/assets/demo-codex-search.png)

Ask dsh web for today's top AI stories. dsh's native search tool row runs straight on the modsearch engine chain, and eighteen seconds later three stories come back, each with a source link.

![dsh web's native search running on the modsearch engine chain, returning three sourced stories](https://raw.githubusercontent.com/flyzstu/modsearch/main/assets/demo-dsh-web-search.png)

Ask which Node.js line is still in maintenance. `read_page` reads the release page and the release schedule in turn, and sixty seconds later the verdict arrives with a version status table and sources at the end.

![read_page reading two pages and returning the Node.js maintenance verdict](https://raw.githubusercontent.com/flyzstu/modsearch/main/assets/demo-dsh-web-fetch.png)

## Supported engines

Firecrawl works with zero setup. Every other engine is one command away. Keys live in `~/.modsearch/config.json` (0600, masked when shown):

| Engine | Does | Free tier | Turn it on |
| :-- | :-- | :-- | :-- |
| Firecrawl (default) | web search + page fetch | keyless: 1,000 free credits/month, no signup. A free key adds your own 1,000/month | nothing, it works as installed |
| AnySearch | web search + batch search + page fetch | public keyless tier / personal API key | `modsearch config set anysearch.apiKey <key>` |
| Antigravity CLI | web search + page fetch | free, browser sign-in | install `agy` and sign in |
| Ollama | web search + page fetch | free key with Ollama account | `modsearch config set ollama.apiKey <key>` |
| Brave | web search | 2,000 queries/month, no card | `modsearch config set brave.apiKey <key>` |
| Tavily | web search | 1,000 credits/month, no card | `modsearch config set tavily.apiKey <key>` |
| Exa | web search | $10/month recurring credit (~1,400 searches), no card | `modsearch config set exa.apiKey <key>` |
| Grok Build | X (Twitter) search | rides SuperGrok or X Premium | install `grok` and sign in |
| local | page fetch | built in, nothing to install | nothing |

Keys can also come from the environment (`ANYSEARCH_API_KEY`, `OLLAMA_API_KEY`, `BRAVE_API_KEY`, `TAVILY_API_KEY`, `EXA_API_KEY`, `FIRECRAWL_API_KEY`). One engine can take multiple keys as a comma-separated value such as `key-one,key-two`, in either the config file or its environment variable. Multiple engines configured means automatic failover, best first. Every engine participates by default. Exclude one with `modsearch config set anysearch.enabled false`. Using an AnySearch-, Ollama-, Brave-, Tavily-, Exa-, or Firecrawl-compatible third-party or self-hosted endpoint? Point the engine at it: `modsearch config set anysearch.baseURL <url>`. Official endpoints stay built into the code and are never written as default config. Every knob, engine by engine, is in the [configuration guide](skills/modsearch/references/configure.md).

## Installation

**Step 1, hand it to your AI.** Search and page fetch work as soon as the skill lands, on Firecrawl's free keyless quota, so installation is one message:

> Install and configure the modsearch skill following INSTALL.md at https://github.com/flyzstu/modsearch, then run the health check and tell me the result.

**Step 2 (optional), add more free engines.** Antigravity CLI writes better synthesized answers. A free AnySearch, Ollama, Brave, Tavily, Exa, or Firecrawl key adds a personal quota on top of the keyless one. None requires a card. agy's browser sign-in is the only step that needs your hands:

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
agy                                                           # sign in, then exit
```

Picked a key instead? Send one line to your AI: "set my anysearch key to ...", "set my ollama key to ..." or "set my brave key to ...".

dsh users have a path that never touches the command line. Settings → Plugins → Plugin config has a ModSearch card: pick the preferred engine, fill in an API key or a self-hosted endpoint, tick which engines join failover, hit save and it takes effect.

![The ModSearch card in the dsh settings page, shown in Chinese: pick the preferred engine, fill in an API key and endpoint, tick the engines that join failover](https://raw.githubusercontent.com/flyzstu/modsearch/main/assets/demo-dsh-settings-card.jpg)

## Usage

Once installed, you do not need to remember any commands. Just chat. Ask anything that needs checking, or paste a URL, and the skill triggers on its own: it picks an engine, runs the search or fetch, and the answer comes back with sources.

## Documentation

| Doc | Read it when |
| :-- | :-- |
| [INSTALL.md](INSTALL.md) | Installing the skill step by step (written for an agent) |
| [CLI manual](skills/modsearch/references/cli.md) | The CLI the skill drives: flags, config, doctor |
| [Troubleshooting](docs/troubleshooting.md) | A command failed and the message needs decoding |
| [Configuration](skills/modsearch/references/configure.md) | Setting a key, switching engines, fixing config |
| [Output contract](skills/modsearch/references/output-schema.md) | Parsing the JSON or building on it |
| [dsh plugin](docs/dsh.md) | Installing, configuring, verifying, and updating the native dsh bundle |
| [Harness setup](docs/harness-setup.md) | Wiring it into Codex, Claude Code, OpenCode, or Pi |
| [Security](docs/security.md) | SSRF guards, DNS-rebinding protection, untrusted input |
| [CHANGELOG](CHANGELOG.md) | Finding what changed in a version |

GitHub and other sites blocked because Steam++ / Watt Toolkit or a VPN pointed them at this machine or a reserved address? See [Blocked private network target](docs/troubleshooting.md#blocked-private-network-target).

## Contributing

Contributions from the community are warmly welcomed!

- **[Open an issue](https://github.com/flyzstu/modsearch/issues)**: Bugs, suggestions, confusing errors, or documentation improvements.
- **[Submit a Pull Request](https://github.com/flyzstu/modsearch/pulls)**: Code enhancements and feature additions are always appreciated.

## Disclaimer

ModSearch is MIT-licensed, so use is not restricted. The project gives no warranty and no endorsement for any particular use, commercial or otherwise. The upstream engines it drives (AnySearch, Ollama, Brave, Antigravity CLI, Tavily, Exa, Firecrawl, Grok Build) each carry their own terms and quotas, and complying with them is the user's responsibility.

## License

MIT
