// AnySearch Web Search and Web Fetch (https://api.anysearch.com).
// One provider, two roles: search and fetch.
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
import {
  ANYSEARCH_DEFAULT_BASE_URL,
  AnySearchClient,
  AnySearchClientError,
} from './anysearch/index.ts';

const DEFAULT_SEARCH_RESULTS = 8;
const MAX_SEARCH_RESULTS = 20;
const MIN_SEARCH_RESULTS = 1;
const MAX_LINKS = 20;

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

/** Extract markdown links from text. */
function extractLinksFromMarkdown(text: string): Array<{ text: string; url: string }> {
  const links: Array<{ text: string; url: string }> = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const linkText = match[1]?.trim() || '';
    const linkUrl = match[2]?.trim() || '';
    if (linkUrl) {
      links.push({ text: linkText || linkUrl, url: linkUrl });
      if (links.length >= MAX_LINKS) break;
    }
  }
  return links;
}

export async function executeAnySearch(options: EngineRequest): Promise<EngineOutput> {
  return options.mode === 'fetch' ? anySearchFetch(options) : anySearchSearch(options);
}

async function anySearchSearch(options: EngineRequest): Promise<EngineOutput> {
  if (!options.query) {
    throw new Error('Search mode requires a query.');
  }

  const apiKeys = splitApiKeys(options.settings.apiKey);
  const apiKey = apiKeys[0];
  const apiKeySecrets = [...new Set([...apiKeys, ...(options.apiKeySecrets ?? [])])];
  const baseURL = options.settings.baseURL || ANYSEARCH_DEFAULT_BASE_URL;

  const client = new AnySearchClient({
    resolveApiKey: () => Promise.resolve(apiKey),
    baseURL,
  });

  const maxResults = clampSearchResults(options.maxResults);
  const startedAt = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  timer.unref?.();

  try {
    const response = await client.search(
      {
        query: options.query,
        maxResults,
      },
      controller.signal,
    );

    const items = response.results.map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.snippet ?? (r.content ? r.content.slice(0, 200) : ''),
      source: r.url ? safeHostname(r.url) : undefined,
    }));

    const result = {
      summary:
        items
          .map((item) => item.snippet)
          .filter(Boolean)
          .join(' ') || (items.length > 0 ? `Found ${items.length} results.` : 'No results found.'),
      items,
      uncertainty: items.length === 0 ? ['No results found for this query.'] : [],
    };

    return {
      result,
      meta: {
        conversationId: null,
        durationSeconds: (Date.now() - startedAt) / 1000,
        usage: { resultCount: items.length },
      },
    };
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      throw new Error(`anysearch timed out after ${options.timeoutMs} ms.`);
    }
    if (error instanceof AnySearchClientError) {
      const message = redactSecrets(error.message, apiKeySecrets);
      if (
        error.httpStatus === 429 ||
        error.errorCode === 'rate_limit_exceeded' ||
        isQuotaFailureMessage(message)
      ) {
        throw new ApiKeyFailureError(
          `anysearch is rate limited or out of quota: ${message}. Set an API key or use another engine.`,
        );
      }
      if (error.httpStatus === 401 || error.httpStatus === 403) {
        if (!apiKey) {
          throw new Error(
            `anysearch rejected the anonymous request (${error.httpStatus}). Set an API key: modsearch config set anysearch.apiKey <key>`,
          );
        }
        throw new ApiKeyFailureError(
          `anysearch rejected the API key (${error.httpStatus}). Fix it: modsearch config set anysearch.apiKey <key>`,
        );
      }
      throw new Error(message);
    }
    throw new Error(
      `anysearch request failed: ${redactSecrets(
        error instanceof Error ? error.message : String(error),
        apiKeySecrets,
      )}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function anySearchFetch(options: EngineRequest): Promise<EngineOutput> {
  if (!options.url) {
    throw new Error('Fetch mode requires a URL.');
  }

  const targetUrl = normalizeFetchUrl(options.url);

  if (isLiteralReservedTarget(targetUrl)) {
    throw new Error(
      `Cannot fetch reserved or private network address "${options.url}" via anysearch cloud extract.`,
    );
  }

  const cloudDisclosure = await inspectCloudDisclosureTarget(targetUrl);
  if (cloudDisclosure.reserved) {
    const resolved =
      cloudDisclosure.addresses.length > 0 ? ` -> ${cloudDisclosure.addresses.join(', ')}` : '';
    throw new Error(
      `Target "${options.url}" resolves to private address${resolved}; will not send private target to anysearch cloud extract.`,
    );
  }

  const apiKeys = splitApiKeys(options.settings.apiKey);
  const apiKey = apiKeys[0];
  const apiKeySecrets = [...new Set([...apiKeys, ...(options.apiKeySecrets ?? [])])];
  const baseURL = options.settings.baseURL || ANYSEARCH_DEFAULT_BASE_URL;

  const client = new AnySearchClient({
    resolveApiKey: () => Promise.resolve(apiKey),
    baseURL,
  });

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  timer.unref?.();

  try {
    const response = await client.extract(
      {
        url: targetUrl.href,
      },
      controller.signal,
    );

    const content = response.content || '';
    const truncatedContent =
      content.length > MAX_CONTENT_CHARS ? content.slice(0, MAX_CONTENT_CHARS) : content;
    const links = extractLinksFromMarkdown(content);

    const warnings: string[] = [];
    if (!apiKey) {
      warnings.push('Fetched via anysearch keyless extract service.');
    }

    const result = {
      summary: response.title || safeHostname(response.url) || 'Fetched page',
      content: truncatedContent,
      links,
      uncertainty: content.length === 0 ? ['The page returned no readable content.'] : [],
      warnings,
    };

    return {
      result,
      meta: {
        conversationId: null,
        durationSeconds: (Date.now() - startedAt) / 1000,
        usage: { length: truncatedContent.length },
      },
    };
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      throw new Error(`anysearch timed out after ${options.timeoutMs} ms.`);
    }
    if (error instanceof AnySearchClientError) {
      const message = redactSecrets(error.message, apiKeySecrets);
      if (
        error.httpStatus === 429 ||
        error.errorCode === 'rate_limit_exceeded' ||
        isQuotaFailureMessage(message)
      ) {
        throw new ApiKeyFailureError(
          `anysearch is rate limited or out of quota: ${message}. Set an API key or use another engine.`,
        );
      }
      if (error.httpStatus === 401 || error.httpStatus === 403) {
        if (!apiKey) {
          throw new Error(
            `anysearch rejected the anonymous request (${error.httpStatus}). Set an API key: modsearch config set anysearch.apiKey <key>`,
          );
        }
        throw new ApiKeyFailureError(
          `anysearch rejected the API key (${error.httpStatus}). Fix it: modsearch config set anysearch.apiKey <key>`,
        );
      }
      throw new Error(message);
    }
    throw new Error(
      `anysearch request failed: ${redactSecrets(
        error instanceof Error ? error.message : String(error),
        apiKeySecrets,
      )}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export const anysearchProvider: SearchEngine = {
  name: 'anysearch',
  roles: ['search', 'fetch'],
  requirement:
    'set an AnySearch API key (supports keyless/anonymous free tier at https://api.anysearch.com)',
  isAvailable: (settings, env) =>
    splitApiKeys(settings.apiKey).length > 0 || splitApiKeys(env.ANYSEARCH_API_KEY).length > 0,
  defaultModel: 'anysearch-v1',
  execute: executeAnySearch,
};
