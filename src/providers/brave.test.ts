import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeBraveSearch } from './brave.ts';
import { resolveEngine } from './index.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Mock the global fetch with a JSON response, capturing the request. */
function mockFetchJson(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn(async (url: string, requestInit: RequestInit) => {
    calls.push({ url, init: requestInit });
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      statusText: 'OK',
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

describe('brave provider', () => {
  it('resolves by name and exposes execute instead of buildInvocation', () => {
    const engine = resolveEngine('brave');
    expect(engine.name).toBe('brave');
    expect(engine.roles).toEqual(['search']);
    expect(engine.execute).toBeTypeOf('function');
    expect(engine.buildInvocation).toBeUndefined();
  });

  it('resolves alias brave-search to brave', () => {
    const engine = resolveEngine('brave-search');
    expect(engine.name).toBe('brave');
  });

  it('rejects fetch mode', async () => {
    await expect(
      executeBraveSearch({
        mode: 'fetch',
        url: 'https://example.com',
        timeoutMs: 1000,
        settings: {},
      }),
    ).rejects.toThrow(/does not support page fetch/);
  });

  it('requires an API key', async () => {
    await expect(
      executeBraveSearch({ mode: 'search', query: 'anything', timeoutMs: 1000, settings: {} }),
    ).rejects.toThrow(/BRAVE_API_KEY|config set brave.apiKey/);
  });

  it('gets from the REST endpoint with X-Subscription-Token header and query params', async () => {
    const calls = mockFetchJson({ web: { results: [] } });
    await executeBraveSearch({
      mode: 'search',
      query: 'machine learning',
      maxResults: 5,
      timeoutMs: 1000,
      settings: { apiKey: 'bsa-test' },
    });
    expect(calls).toHaveLength(1);
    const parsedUrl = new URL(calls[0].url);
    expect(parsedUrl.origin).toBe('https://api.search.brave.com');
    expect(parsedUrl.pathname).toBe('/res/v1/web/search');
    expect(parsedUrl.searchParams.get('q')).toBe('machine learning');
    expect(parsedUrl.searchParams.get('count')).toBe('5');
    expect(parsedUrl.searchParams.get('text_decorations')).toBe('0');
    expect(parsedUrl.searchParams.get('extra_snippets')).toBe('true');
    expect(calls[0].init.method).toBe('GET');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-subscription-token']).toBe('bsa-test');
    expect(headers.accept).toBe('application/json');
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('clamps count between 1 and 20', async () => {
    const calls = mockFetchJson({ web: { results: [] } });
    await executeBraveSearch({
      mode: 'search',
      query: 'test clamp',
      maxResults: 50,
      timeoutMs: 1000,
      settings: { apiKey: 'bsa-test' },
    });
    const parsedUrl = new URL(calls[0].url);
    expect(parsedUrl.searchParams.get('count')).toBe('20');
  });

  it('gets from a configured baseURL, trailing slash folded', async () => {
    const calls = mockFetchJson({ web: { results: [] } });
    await executeBraveSearch({
      mode: 'search',
      query: 'q',
      timeoutMs: 1000,
      settings: { apiKey: 'bsa-test', baseURL: 'https://gw.example.com/brave/' },
    });
    expect(calls[0].url).toContain('https://gw.example.com/brave/res/v1/web/search');
  });

  it('refuses a baseURL that is not a full http(s) URL', async () => {
    mockFetchJson({});
    await expect(
      executeBraveSearch({
        mode: 'search',
        query: 'q',
        timeoutMs: 1000,
        settings: { apiKey: 'bsa-test', baseURL: 'gw.example.com' },
      }),
    ).rejects.toThrow(/Invalid engine baseURL/);
  });

  it('maps brave results into the engine contract including extra_snippets and profile', async () => {
    mockFetchJson({
      query: { original: 'test query', more_results_available: true },
      web: {
        results: [
          {
            title: 'Title A',
            url: 'https://a.example.com/page',
            description: 'Main snippet A.',
            page_age: '2024-05-01T12:00:00Z',
            profile: { name: 'Example Site A' },
            extra_snippets: ['Extra 1', 'Extra 2'],
          },
          {
            title: 'Title B',
            url: 'https://b.example.com/item',
            description: 'Main snippet B.',
          },
          {
            title: 'Title C',
            url: 'invalid url',
            description: 'Snippet C',
          },
        ],
      },
    });

    const parsed = await executeBraveSearch({
      mode: 'search',
      query: 'test query',
      maxResults: 3,
      timeoutMs: 1000,
      settings: { apiKey: 'bsa-test' },
    });

    const result = parsed.result as {
      summary: string;
      items: Array<Record<string, unknown>>;
      uncertainty: string[];
      warnings: string[];
    };
    expect(result.summary).toContain('Brave Search returned 3 ranked result(s)');
    expect(result.items).toEqual([
      {
        title: 'Title A',
        url: 'https://a.example.com/page',
        snippet: 'Main snippet A. Extra 1 Extra 2',
        source: 'Example Site A',
        published_at: '2024-05-01T12:00:00Z',
      },
      {
        title: 'Title B',
        url: 'https://b.example.com/item',
        snippet: 'Main snippet B.',
        source: 'b.example.com',
        published_at: undefined,
      },
      {
        title: 'Title C',
        url: 'invalid url',
        snippet: 'Snippet C',
        source: undefined,
        published_at: undefined,
      },
    ]);
    expect(result.uncertainty).toEqual([]);
    expect(result.warnings[0]).toContain(
      'Brave Search returns ranked results without an LLM summary',
    );
    expect(parsed.meta.usage).toEqual({ resultCount: 3 });
  });

  it('handles empty results cleanly', async () => {
    mockFetchJson({ web: { results: [] } });
    const parsed = await executeBraveSearch({
      mode: 'search',
      query: 'nonexistent query',
      timeoutMs: 1000,
      settings: { apiKey: 'bsa-test' },
    });
    const result = parsed.result as {
      summary: string;
      items: unknown[];
      uncertainty: string[];
    };
    expect(result.summary).toBe('');
    expect(result.items).toEqual([]);
    expect(result.uncertainty).toEqual(['No results found for this query.']);
  });

  it('surfaces a 401 response as an ApiKeyFailureError', async () => {
    mockFetchJson({ message: 'Unauthorized: Invalid token' }, { ok: false, status: 401 });
    await expect(
      executeBraveSearch({
        mode: 'search',
        query: 'q',
        timeoutMs: 1000,
        settings: { apiKey: 'bad-key' },
      }),
    ).rejects.toThrow(/brave rejected the API key \(401\)/);
  });

  it('surfaces a 429 response as an ApiKeyFailureError for rate limiting / quota', async () => {
    mockFetchJson({ message: 'Too many requests' }, { ok: false, status: 429 });
    await expect(
      executeBraveSearch({
        mode: 'search',
        query: 'q',
        timeoutMs: 1000,
        settings: { apiKey: 'rate-limited-key' },
      }),
    ).rejects.toThrow(/brave returned 429/);
  });

  it('surfaces a 422 response with invalid subscription token as an ApiKeyFailureError', async () => {
    mockFetchJson(
      {
        error: {
          code: 'SUBSCRIPTION_TOKEN_INVALID',
          detail: 'The provided API key is invalid.',
        },
      },
      { ok: false, status: 422 },
    );
    await expect(
      executeBraveSearch({
        mode: 'search',
        query: 'q',
        timeoutMs: 1000,
        settings: { apiKey: 'invalid-token' },
      }),
    ).rejects.toThrow(/brave rejected the API key \(422\)/);
  });

  it('surfaces a 402 quota error as an ApiKeyFailureError', async () => {
    mockFetchJson({ message: 'out of credits' }, { ok: false, status: 402 });
    await expect(
      executeBraveSearch({
        mode: 'search',
        query: 'q',
        timeoutMs: 1000,
        settings: { apiKey: 'bsa-test' },
      }),
    ).rejects.toThrow(/brave returned 402/);
  });

  it('surfaces a 500 response as a standard Error', async () => {
    mockFetchJson({ message: 'Internal server error' }, { ok: false, status: 500 });
    await expect(
      executeBraveSearch({
        mode: 'search',
        query: 'q',
        timeoutMs: 1000,
        settings: { apiKey: 'bsa-test' },
      }),
    ).rejects.toThrow(/brave returned 500/);
  });

  it('uses only the first configured key and redacts every configured key from errors', async () => {
    const first = 'bsa-secret-alpha';
    const second = 'bsa-secret-beta';
    const calls = mockFetchJson(
      { detail: `${first} failed and echoed ${second}` },
      { ok: false, status: 401 },
    );
    let error: Error | undefined;
    try {
      await executeBraveSearch({
        mode: 'search',
        query: 'q',
        timeoutMs: 1000,
        settings: { apiKey: `${first}, ${second}` },
      });
    } catch (caught) {
      error = caught as Error;
    }

    expect((calls[0].init.headers as Record<string, string>)['x-subscription-token']).toBe(first);
    expect(error?.message).not.toContain(first);
    expect(error?.message).not.toContain(second);
  });

  it('aborts the underlying request on timeout and reports it', async () => {
    let sawAbort = false;
    const fn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            sawAbort = true;
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );
    vi.stubGlobal('fetch', fn);

    await expect(
      executeBraveSearch({
        mode: 'search',
        query: 'q',
        timeoutMs: 20,
        settings: { apiKey: 'bsa-test' },
      }),
    ).rejects.toThrow(/brave timed out after 20 ms/);
    expect(sawAbort).toBe(true);
  });
});
