// Ollama Web Search and Web Fetch (https://docs.ollama.com/capabilities/web-search).
// One provider, two roles: search and fetch. Both talk to Ollama's REST API
// (https://ollama.com/api/web_search and https://ollama.com/api/web_fetch) with Bearer token authentication.
import { ApiKeyFailureError, isQuotaFailureMessage, splitApiKeys } from '../util/apiKeys.ts';
import { redactSecrets } from '../util/redact.ts';
import {
  inspectCloudDisclosureTarget,
  isLiteralReservedTarget,
  normalizeFetchUrl,
} from './http/network.ts';
import type { EngineOutput, EngineRequest, SearchEngine } from './index.ts';
import { resolveEndpoint } from './endpoint.ts';
import { MAX_CONTENT_CHARS } from './limits.ts';

const OLLAMA_DEFAULT_BASE = 'https://ollama.com';
const DEFAULT_SEARCH_RESULTS = 5;
const MAX_SEARCH_RESULTS = 10;
const MIN_SEARCH_RESULTS = 1;
const MAX_LINKS = 20;

interface OllamaSearchResultItem {
  title?: string;
  url?: string;
  content?: string;
}

interface OllamaSearchResponse {
  results?: OllamaSearchResultItem[];
}

interface OllamaFetchResponse {
  title?: string;
  content?: string;
  links?: unknown;
}

function clampSearchResults(maxResults?: number): number {
  if (typeof maxResults !== 'number' || Number.isNaN(maxResults)) {
    return DEFAULT_SEARCH_RESULTS;
  }
  return Math.min(Math.max(Math.floor(maxResults), MIN_SEARCH_RESULTS), MAX_SEARCH_RESULTS);
}

function safeHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function normalizeLinks(raw: unknown): Array<{ text: string; url: string }> {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: Array<{ text: string; url: string }> = [];
  for (const entry of raw) {
    let url: string | undefined;
    let text: string | undefined;
    if (typeof entry === 'string') {
      url = entry;
      text = entry;
    } else if (entry && typeof entry === 'object') {
      const record = entry as { url?: unknown; text?: unknown };
      url = typeof record.url === 'string' ? record.url : undefined;
      text = typeof record.text === 'string' && record.text ? record.text : url;
    }
    if (!url || !/^https?:/i.test(url)) {
      continue;
    }
    out.push({ text: (text ?? url).slice(0, 100), url });
    if (out.length >= MAX_LINKS) {
      break;
    }
  }
  return out;
}

async function ollamaPost(
  url: string,
  apiKey: string,
  apiKeySecrets: readonly string[],
  body: unknown,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  try {
    return await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`ollama timed out after ${timeoutMs} ms.`);
    }
    throw new Error(
      `ollama request failed: ${redactSecrets(
        error instanceof Error ? error.message : String(error),
        apiKeySecrets,
      )}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function ensureOk(response: Response, apiKeySecrets: readonly string[]): Promise<void> {
  if (response.ok) {
    return;
  }
  const detail = redactSecrets((await response.text().catch(() => '')).trim(), apiKeySecrets);
  const message = `ollama returned ${response.status} ${response.statusText}.${detail ? ` ${detail}` : ''}`;
  if (response.status >= 500) {
    throw new Error(message);
  }
  if (
    response.status === 401 ||
    response.status === 403 ||
    /unauthorized/i.test(detail) ||
    /invalid.*key/i.test(detail)
  ) {
    throw new ApiKeyFailureError(
      `ollama rejected the API key (${response.status}). Fix it: modsearch config set ollama.apiKey <key>${detail ? ` (${detail})` : ''}`,
    );
  }
  if (response.status === 429 || response.status === 402 || isQuotaFailureMessage(detail)) {
    throw new ApiKeyFailureError(message);
  }
  throw new Error(message);
}

export async function executeOllama(options: EngineRequest): Promise<EngineOutput> {
  return options.mode === 'fetch' ? ollamaFetch(options) : ollamaSearch(options);
}

async function ollamaSearch(options: EngineRequest): Promise<EngineOutput> {
  const apiKeys = splitApiKeys(options.settings.apiKey);
  const apiKey = apiKeys[0];
  if (!apiKey) {
    throw new Error(
      'The ollama provider needs an API key. Set OLLAMA_API_KEY, or run: modsearch config set ollama.apiKey <key> (get a key from https://ollama.com/settings/keys)',
    );
  }

  const apiKeySecrets = [...new Set([...apiKeys, ...(options.apiKeySecrets ?? [])])];
  const maxResults = clampSearchResults(options.maxResults);
  const startedAt = Date.now();

  const endpoint = resolveEndpoint(
    options.settings.baseURL,
    OLLAMA_DEFAULT_BASE,
    '/api/web_search',
  );
  const response = await ollamaPost(
    endpoint,
    apiKey,
    apiKeySecrets,
    {
      query: options.query,
      max_results: maxResults,
    },
    options.timeoutMs,
  );
  await ensureOk(response, apiKeySecrets);

  const data = (await response.json()) as OllamaSearchResponse;
  const items = (data.results ?? []).map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.content ?? '',
    source: r.url ? safeHostname(r.url) : undefined,
  }));

  const summary =
    items.length > 0
      ? `Ollama returned ${items.length} ranked result(s) for "${options.query}". Read items for the sources.`
      : '';

  return {
    result: {
      summary,
      items,
      uncertainty: items.length === 0 ? ['No results found for this query.'] : [],
      warnings: [
        'Ollama search returns ranked results without an LLM summary, so the summary is mechanical: read items directly for the evidence.',
      ],
    },
    meta: {
      conversationId: null,
      durationSeconds: (Date.now() - startedAt) / 1000,
      usage: { resultCount: items.length },
    },
  };
}

async function ollamaFetch(options: EngineRequest): Promise<EngineOutput> {
  if (!options.url) {
    throw new Error('Fetch mode requires a URL.');
  }
  const apiKeys = splitApiKeys(options.settings.apiKey);
  const apiKey = apiKeys[0];
  if (!apiKey) {
    throw new Error(
      'The ollama provider needs an API key. Set OLLAMA_API_KEY, or run: modsearch config set ollama.apiKey <key> (get a key from https://ollama.com/settings/keys)',
    );
  }

  const apiKeySecrets = [...new Set([...apiKeys, ...(options.apiKeySecrets ?? [])])];
  const target = normalizeFetchUrl(options.url);

  if (isLiteralReservedTarget(target)) {
    throw new Error(
      `ollama does not fetch the private or reserved target ${target.hostname}. Use the local engine instead.`,
    );
  }
  const disclosure = await inspectCloudDisclosureTarget(target);
  if (disclosure.reserved) {
    const resolved =
      disclosure.addresses.length > 0 ? ` -> ${disclosure.addresses.join(', ')}` : '';
    throw new Error(
      `ollama does not fetch the private or reserved target ${target.hostname}${resolved}. If a VPN or proxy on this machine uses fake-IP DNS, a public hostname may look reserved here. Use the local engine instead.`,
    );
  }

  const startedAt = Date.now();
  const endpoint = resolveEndpoint(options.settings.baseURL, OLLAMA_DEFAULT_BASE, '/api/web_fetch');
  const response = await ollamaPost(
    endpoint,
    apiKey,
    apiKeySecrets,
    {
      url: target.toString(),
    },
    options.timeoutMs,
  );
  await ensureOk(response, apiKeySecrets);

  const data = (await response.json()) as OllamaFetchResponse;
  const rawContent = data.content ?? '';
  const truncated = rawContent.length > MAX_CONTENT_CHARS;
  const content = truncated ? rawContent.slice(0, MAX_CONTENT_CHARS) : rawContent;
  const links = normalizeLinks(data.links);
  const title = data.title || target.toString();

  const uncertainty: string[] = [];
  if (content.length < 200) {
    uncertainty.push(
      'Very little content came back from Ollama, so the page may be genuinely sparse.',
    );
  }

  const warnings = [
    'Fetched through Ollama in the cloud. The content is extracted page text, not the raw HTML as served.',
  ];
  if (truncated) {
    warnings.push(`Content truncated at ${MAX_CONTENT_CHARS} characters.`);
  }

  return {
    result: {
      summary: title,
      content,
      links,
      uncertainty,
      warnings,
    },
    meta: {
      conversationId: null,
      durationSeconds: (Date.now() - startedAt) / 1000,
      usage: {},
    },
  };
}

export const ollamaProvider: SearchEngine = {
  name: 'ollama',
  roles: ['search', 'fetch'],
  requirement: 'set an Ollama API key (from https://ollama.com/settings/keys)',
  isAvailable: (settings, env) =>
    splitApiKeys(settings.apiKey).length > 0 || splitApiKeys(env.OLLAMA_API_KEY).length > 0,
  execute: executeOllama,
};
