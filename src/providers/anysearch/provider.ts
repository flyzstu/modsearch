/** AnySearch implementation of the DeepSeek Harness web search provider. */

import { AnySearchClient, AnySearchClientError } from './client.ts';
import type { AnySearchResult, AnySearchSearchResponse } from './types.ts';

/** Stable provider id selected through `ctx.web`. */
export const ANYSEARCH_PROVIDER_ID = 'anysearch';

export interface WebSearchSource {
  readonly url: string;
  readonly title?: string;
  readonly snippet?: string;
  readonly publishedAt?: string;
}

export interface WebSearchResult {
  readonly content?: string;
  readonly sources: readonly WebSearchSource[];
  readonly truncated: boolean;
}

export interface WebSearchRequest {
  readonly query: string;
  readonly maxResults?: number;
}

export interface WebSearchProvider {
  readonly id: string;
  available(): boolean;
  search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
}

export class WebError extends Error {
  readonly code: string;

  constructor(message: string, code: string, options?: { cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'WebError';
    this.code = code;
  }
}

/** Map a validated AnySearch result into the provider-neutral web source. */
export function mapAnySearchResult(result: AnySearchResult): WebSearchSource {
  const title = result.title.trim();
  const snippet = result.snippet?.trim();
  return {
    url: result.url,
    ...(title.length > 0 ? { title } : {}),
    ...(snippet !== undefined && snippet.length > 0 ? { snippet } : {}),
  };
}

/** Map a validated AnySearch response into the provider-neutral result. */
export function mapAnySearchResponse(response: AnySearchSearchResponse): WebSearchResult {
  return {
    sources: response.results.map(mapAnySearchResult),
    truncated: false,
  };
}

/** Search provider backed by the shared AnySearch HTTP client. */
export class AnySearchProvider implements WebSearchProvider {
  readonly id = ANYSEARCH_PROVIDER_ID;

  constructor(private readonly client: AnySearchClient) {}

  available(): boolean {
    return this.client.available();
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    try {
      return mapAnySearchResponse(
        await this.client.search(
          {
            query: request.query,
            ...(request.maxResults === undefined ? {} : { maxResults: request.maxResults }),
          },
          signal,
        ),
      );
    } catch (error: unknown) {
      if (error instanceof AnySearchClientError && error.kind === 'aborted') {
        throw new WebError('AnySearch search aborted', 'WEB_ABORTED', { cause: error });
      }
      throw new WebError(
        error instanceof Error ? error.message : `AnySearch search failed: ${String(error)}`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      );
    }
  }
}
