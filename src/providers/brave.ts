// Brave Search API engine (https://api-dashboard.search.brave.com/documentation/services/web-search).
// Search mode only.
//
// This talks to the Brave Search REST API directly with the built-in fetch.
// It maps ranked results into the shared engine schema contract.
import { ApiKeyFailureError, isQuotaFailureMessage, splitApiKeys } from '../util/apiKeys.ts';
import { redactSecrets } from '../util/redact.ts';
import type { EngineRequest, EngineOutput, SearchEngine } from './index.ts';
import { resolveEndpoint } from './endpoint.ts';

const DEFAULT_MAX_RESULTS = 8;
const BRAVE_DEFAULT_BASE = 'https://api.search.brave.com';

interface BraveResultProfile {
  name?: string;
  long_name?: string;
  img?: string;
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  page_age?: string;
  page_fetch_time?: string;
  profile?: BraveResultProfile;
  extra_snippets?: string[];
}

interface BraveSearchResponse {
  query?: {
    original?: string;
    more_results_available?: boolean;
  };
  web?: {
    type?: string;
    results?: BraveWebResult[];
  };
}

export async function executeBraveSearch(options: EngineRequest): Promise<EngineOutput> {
  if (options.mode === 'fetch') {
    throw new Error('The brave engine does not support page fetch (-u). It searches only.');
  }
  if (!options.query) {
    throw new Error('Search mode requires a query.');
  }

  const apiKeys = splitApiKeys(options.settings.apiKey);
  const apiKey = apiKeys[0];
  const apiKeySecrets = [...new Set([...apiKeys, ...(options.apiKeySecrets ?? [])])];
  if (!apiKey) {
    throw new Error(
      'The brave provider needs an API key. Set BRAVE_API_KEY, or run: modsearch config set brave.apiKey <key> (free tier: 2,000 queries/month at https://brave.com/search/api/)',
    );
  }

  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const count = Math.min(Math.max(maxResults, 1), 20);
  const startedAt = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  timer.unref?.();

  const baseUrl = resolveEndpoint(
    options.settings.baseURL,
    BRAVE_DEFAULT_BASE,
    '/res/v1/web/search',
  );
  const url = new URL(baseUrl);
  url.searchParams.set('q', options.query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('offset', '0');
  // text_decorations=0 removes <b> markers around search terms in titles and snippets
  url.searchParams.set('text_decorations', '0');
  url.searchParams.set('extra_snippets', 'true');

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'accept-encoding': 'gzip',
        'x-subscription-token': apiKey,
      },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`brave timed out after ${options.timeoutMs} ms.`);
    }
    throw new Error(
      `brave request failed: ${redactSecrets(
        error instanceof Error ? error.message : String(error),
        [...apiKeySecrets, options.settings.baseURL],
      )}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = redactSecrets((await response.text().catch(() => '')).trim(), [
      ...apiKeySecrets,
      options.settings.baseURL,
    ]);
    const message = `brave returned ${response.status} ${response.statusText}.${detail ? ` ${detail}` : ''}`;
    if (response.status >= 500) {
      throw new Error(message);
    }
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 422 ||
      /SUBSCRIPTION_TOKEN/i.test(detail) ||
      /API key is invalid/i.test(detail)
    ) {
      throw new ApiKeyFailureError(
        `brave rejected the API key (${response.status}). Fix it: modsearch config set brave.apiKey <key>${detail ? ` (${detail})` : ''}`,
      );
    }
    if (response.status === 429 || response.status === 402 || isQuotaFailureMessage(detail)) {
      throw new ApiKeyFailureError(message);
    }
    throw new Error(message);
  }

  const data = (await response.json()) as BraveSearchResponse;

  const items = (data.web?.results ?? []).map((r) => {
    let snippet = r.description ?? '';
    if (Array.isArray(r.extra_snippets) && r.extra_snippets.length > 0) {
      const extra = r.extra_snippets.filter(
        (s): s is string => typeof s === 'string' && Boolean(s.trim()),
      );
      if (extra.length > 0) {
        snippet = [snippet, ...extra].filter(Boolean).join(' ');
      }
    }

    return {
      title: r.title ?? '',
      url: r.url ?? '',
      snippet,
      source: r.profile?.name || safeHostname(r.url),
      published_at: r.page_age ?? undefined,
    };
  });

  const summary =
    items.length > 0
      ? `Brave Search returned ${items.length} ranked result(s) for "${options.query}". Read items for the sources.`
      : '';

  return {
    result: {
      summary,
      items,
      uncertainty: items.length === 0 ? ['No results found for this query.'] : [],
      warnings: [
        'Brave Search returns ranked results without an LLM summary, so the summary is mechanical: read items directly for the evidence.',
      ],
    },
    meta: {
      conversationId: null,
      durationSeconds: (Date.now() - startedAt) / 1000,
      usage: { resultCount: items.length },
    },
  };
}

function safeHostname(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export const braveProvider: SearchEngine = {
  name: 'brave',
  roles: ['search'],
  requirement:
    'set a Brave Search key (free tier: 2,000 queries/month at https://brave.com/search/api/)',
  isAvailable: (settings, env) =>
    splitApiKeys(settings.apiKey).length > 0 || splitApiKeys(env.BRAVE_API_KEY).length > 0,
  defaultModel: 'brave-web',
  execute: executeBraveSearch,
};
