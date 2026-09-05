import { AnySearchClient } from './client.ts';
import { AnySearchFetchProvider } from './fetch-provider.ts';
import { DEFAULT_MAX_RENDERED_CONTENT_CHARS } from './limits.ts';
import { AnySearchProvider } from './provider.ts';
import { registerBatchSearchTool } from './tools/batch.ts';
import { registerCapabilitiesTool } from './tools/capabilities.ts';
import { registerAdvancedSearchTool } from './tools/search.ts';

export {
  ANYSEARCH_DEFAULT_BASE_URL,
  AnySearchClient,
  AnySearchClientError,
} from './client.ts';
export type {
  AnySearchClientOptions,
  AnySearchOperation,
} from './client.ts';
export {
  ANYSEARCH_FETCH_PROVIDER_ID,
  AnySearchFetchProvider,
  mapAnySearchExtractResponse,
} from './fetch-provider.ts';
export type {
  WebFetchBody,
  WebFetchProvider,
  WebFetchRequest,
  WebFetchResult,
} from './fetch-provider.ts';
export {
  ANYSEARCH_HTTP_TIMEOUT_MS,
  ANYSEARCH_TOOL_TIMEOUT_MS,
  DEFAULT_MAX_RENDERED_CONTENT_CHARS,
  MAX_BATCH_SEARCH_ITEMS,
  MAX_CANONICAL_CONTENT_CHARS,
  MAX_CAPABILITY_DOMAINS,
  MAX_UPSTREAM_ERROR_CHARS,
} from './limits.ts';
export {
  ANYSEARCH_PROVIDER_ID,
  AnySearchProvider,
  mapAnySearchResponse,
  mapAnySearchResult,
  WebError,
} from './provider.ts';
export type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from './provider.ts';
export {
  ANYSEARCH_BATCH_SEARCH_TOOL_NAME,
  executeBatchSearch,
  formatBatchSearchOutput,
  parseBatchSearchItems,
  registerBatchSearchTool,
} from './tools/batch.ts';
export type {
  AnySearchBatchFailure,
  AnySearchBatchItem,
  AnySearchBatchOutput,
  AnySearchBatchSuccess,
  BatchToolItemArgs,
} from './tools/batch.ts';
export {
  ANYSEARCH_CAPABILITIES_TOOL_NAME,
  formatDomains,
  formatSubDomains,
  parseCapabilityDomains,
  registerCapabilitiesTool,
} from './tools/capabilities.ts';
export {
  ANYSEARCH_SEARCH_TOOL_NAME,
  canonicalSearchResults,
  formatAdvancedSearchOutput,
  parseAdvancedSearchArgs,
  registerAdvancedSearchTool,
} from './tools/search.ts';
export type {
  JsonValue,
  ParsedSearchArgs,
} from './tools/search.ts';
export type {
  AnySearchDomainCapability,
  AnySearchDomainsResponse,
  AnySearchDomainSummary,
  AnySearchExtractRequest,
  AnySearchExtractResponse,
  AnySearchMetadata,
  AnySearchParamInfo,
  AnySearchParamValue,
  AnySearchResult,
  AnySearchSearchRequest,
  AnySearchSearchResponse,
  AnySearchSubDomain,
  AnySearchSubDomainsResponse,
} from './types.ts';
export {
  ANYSEARCH_DSH_CLIENT_ID,
  ANYSEARCH_DSH_VERSION,
} from './version.ts';

/** Cordis plugin name used in loader diagnostics. */
export const name = 'web-search-anysearch';

/** Capability seams required by the Providers and model-facing tools. */
export const inject = ['web', 'credentials', 'systemPrompt', 'tools'];

const DEFAULT_API_KEY_ENV = 'ANYSEARCH_API_KEY';

/** AnySearch plugin configuration. */
export interface Config {
  /** Credential reference resolved for each operation. Missing values use anonymous access. */
  apiKeyEnv?: string;
  /** API base URL. Defaults to the public AnySearch API. */
  baseURL?: string;
  /** Aggregate cleaned-content characters rendered to the model by one advanced tool operation. */
  maxRenderedContentChars?: number;
}

/** Fully validated configuration consumed by the plugin runtime. */
export interface ResolvedConfig {
  /** Non-empty credential reference resolved for every operation. */
  apiKeyEnv: string;
  /** Absolute HTTP or HTTPS API base URL. */
  baseURL: string;
  /** Aggregate cleaned-content characters rendered by one tool operation. */
  maxRenderedContentChars: number;
}

/** Resolve defaults and reject self-contained configuration errors before registration. */
export function resolveConfig(config: Config): ResolvedConfig {
  const apiKeyEnv = (config.apiKeyEnv ?? DEFAULT_API_KEY_ENV).trim();
  if (apiKeyEnv.length === 0) throw new Error('apiKeyEnv must be a non-empty credential reference');

  const baseURL = (config.baseURL ?? 'https://api.anysearch.com').trim();
  let parsedURL: URL;
  try {
    parsedURL = new URL(baseURL);
  } catch {
    throw new Error('baseURL must be an absolute URL');
  }
  if (parsedURL.protocol !== 'http:' && parsedURL.protocol !== 'https:') {
    throw new Error('baseURL must use HTTP or HTTPS');
  }
  if (parsedURL.username.length > 0 || parsedURL.password.length > 0) {
    throw new Error('baseURL must not contain credentials');
  }

  const maxRenderedContentChars =
    config.maxRenderedContentChars ?? DEFAULT_MAX_RENDERED_CONTENT_CHARS;
  if (!Number.isSafeInteger(maxRenderedContentChars) || maxRenderedContentChars < 1) {
    throw new Error('maxRenderedContentChars must be a positive integer');
  }
  return { apiKeyEnv, baseURL, maxRenderedContentChars };
}

/** Register the AnySearch Provider and advanced tools with their owning services. */
export function apply(ctx: any, config: Config = {}): void {
  const resolved = resolveConfig(config);
  const client = new AnySearchClient({
    resolveApiKey: async () => {
      if (typeof ctx?.credentials?.resolve === 'function') {
        const res = await ctx.credentials.resolve(resolved.apiKeyEnv);
        return res?.value;
      }
      return undefined;
    },
    apiKeyReference: resolved.apiKeyEnv,
    baseURL: resolved.baseURL,
  });

  if (typeof ctx?.web?.registerSearchProvider === 'function') {
    ctx.web.registerSearchProvider(new AnySearchProvider(client));
  }
  if (typeof ctx?.web?.registerFetchProvider === 'function') {
    ctx.web.registerFetchProvider(new AnySearchFetchProvider(client));
  }
  registerCapabilitiesTool(ctx, client);
  registerBatchSearchTool(ctx, client, resolved.maxRenderedContentChars);
  registerAdvancedSearchTool(ctx, client, resolved.maxRenderedContentChars);
}
