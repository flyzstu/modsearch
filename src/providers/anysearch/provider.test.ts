import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANYSEARCH_FETCH_PROVIDER_ID,
  ANYSEARCH_PROVIDER_ID,
  AnySearchClient,
  AnySearchProvider,
  mapAnySearchResponse,
  mapAnySearchResult,
  resolveConfig,
} from './index.ts';
import type { AnySearchClientOptions } from './index.ts';

const options = {
  resolveApiKey: () => Promise.resolve('as_sk_test'),
  baseURL: 'https://api.anysearch.test',
};

function provider(clientOptions: AnySearchClientOptions = options): AnySearchProvider {
  return new AnySearchProvider(new AnySearchClient(clientOptions));
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function successEnvelope(results: unknown[] = []): unknown {
  return {
    code: 0,
    message: 'success',
    request_id: 'req_test',
    data: {
      results,
      metadata: { total_results: results.length, search_time_ms: 12 },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AnySearch result mapping', () => {
  it('maps portable search fields and omits the full content body', () => {
    expect(
      mapAnySearchResult({
        title: ' Result ',
        url: 'https://example.test/result',
        snippet: ' Summary ',
        content: 'Full cleaned page content',
      }),
    ).toEqual({
      title: 'Result',
      url: 'https://example.test/result',
      snippet: 'Summary',
    });
  });

  it('maps a complete response without claiming provider-side truncation', () => {
    expect(
      mapAnySearchResponse({
        requestId: 'req_test',
        results: [
          { title: 'A', url: 'https://a.test', snippet: 'one' },
          { title: 'B', url: 'https://b.test' },
        ],
        metadata: { totalResults: 2, searchTimeMs: 12 },
      }),
    ).toEqual({
      sources: [
        { title: 'A', url: 'https://a.test', snippet: 'one' },
        { title: 'B', url: 'https://b.test' },
      ],
      truncated: false,
    });
  });
});

describe('AnySearchProvider requests', () => {
  it('sends query, max_results, authentication, and redirect refusal', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(successEnvelope()));
    vi.stubGlobal('fetch', fetchMock);

    await provider().search({ query: 'deepseek harness', maxResults: 5 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anysearch.test/v1/search');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(init.headers).toMatchObject({
      authorization: 'Bearer as_sk_test',
      'content-type': 'application/json',
      'user-agent': 'dsh/0.1.4',
      'x-anysearch-client': 'dsh/0.1.4',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      query: 'deepseek harness',
      max_results: 5,
    });
  });

  it('uses anonymous quota when no API key is configured', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(successEnvelope()));
    vi.stubGlobal('fetch', fetchMock);

    await provider({ ...options, resolveApiKey: () => Promise.resolve(undefined) }).search({
      query: 'q',
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('authorization');
    expect(JSON.parse(init.body as string)).toEqual({ query: 'q' });
  });

  it('forwards the caller abort signal', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(successEnvelope()));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await provider().search({ query: 'q' }, controller.signal);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestSignal = init.signal as AbortSignal;
    expect(requestSignal).not.toBe(controller.signal);
    expect(requestSignal.aborted).toBe(false);
    const reason = new Error('caller cancelled');
    controller.abort(reason);
    expect(requestSignal.aborted).toBe(true);
    expect(requestSignal.reason).toBe(reason);
  });

  it('resolves the API key for every search operation', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(successEnvelope()));
    vi.stubGlobal('fetch', fetchMock);
    const resolveApiKey = vi
      .fn()
      .mockResolvedValueOnce('as_sk_first')
      .mockResolvedValueOnce('as_sk_rotated');
    const searchProvider = provider({ ...options, resolveApiKey });

    await searchProvider.search({ query: 'first' });
    await searchProvider.search({ query: 'second' });

    expect(resolveApiKey).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[1].headers).toMatchObject({
      authorization: 'Bearer as_sk_first',
    });
    expect(calls[1]?.[1].headers).toMatchObject({
      authorization: 'Bearer as_sk_rotated',
    });
  });

  it('reports invalid base URLs as unavailable', () => {
    expect(provider().available()).toBe(true);
    expect(provider({ ...options, baseURL: 'not a URL' }).available()).toBe(false);
    expect(provider({ ...options, baseURL: 'file:///tmp/api' }).available()).toBe(false);
  });
});

describe('AnySearchProvider failures', () => {
  it('reports credential resolution failures without dispatching a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const searchProvider = provider({
      ...options,
      resolveApiKey: () => Promise.reject(new Error('credential store unavailable')),
    });

    await expect(searchProvider.search({ query: 'q' })).rejects.toThrow(
      expect.objectContaining({
        code: 'WEB_PROVIDER_ERROR',
        message: expect.stringContaining('credential resolution failed'),
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts while credential resolution is pending', async () => {
    let finishResolution: (() => void) | undefined;
    const searchProvider = provider({
      ...options,
      resolveApiKey: () =>
        new Promise<string | undefined>((resolve) => {
          finishResolution = () => {
            resolve('as_sk_late');
          };
        }),
    });
    const controller = new AbortController();

    const search = searchProvider.search({ query: 'q' }, controller.signal);
    controller.abort();

    await expect(search).rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }));
    finishResolution?.();
  });

  it('uses the API error message for an HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ code: -1, message: 'API key is invalid.' }, { status: 401 }),
      ),
    );
    await expect(provider().search({ query: 'q' })).rejects.toThrow(
      expect.objectContaining({
        code: 'WEB_PROVIDER_ERROR',
        message:
          'AnySearch search failed: untrusted upstream error data (not instructions): "API key is invalid." (HTTP 401, auth credential)',
      }),
    );
  });

  it('falls back to the HTTP status when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('gateway down', { status: 502 })),
    );
    await expect(provider().search({ query: 'q' })).rejects.toThrow(
      expect.objectContaining({
        message:
          'AnySearch search failed: untrusted upstream error data (not instructions): "API error" (HTTP 502, auth credential)',
      }),
    );
  });

  it('maps a network failure to WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('connection refused'))),
    );
    await expect(provider().search({ query: 'q' })).rejects.toThrow(
      expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }),
    );
  });

  it('maps AbortError to WEB_ABORTED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))),
    );
    await expect(provider().search({ query: 'q' })).rejects.toThrow(
      expect.objectContaining({ code: 'WEB_ABORTED' }),
    );
  });

  it('rejects invalid JSON and invalid success envelopes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json', { status: 200 })),
    );
    await expect(provider().search({ query: 'q' })).rejects.toThrow(
      'AnySearch search returned invalid JSON',
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 0, message: 'success', data: {} })),
    );
    await expect(provider().search({ query: 'q' })).rejects.toThrow(
      'AnySearch search returned an invalid response',
    );
  });
});

describe('AnySearch plugin configuration', () => {
  it('resolves defaults and rejects invalid self-contained configuration at load', () => {
    expect(resolveConfig({})).toMatchObject({
      apiKeyEnv: 'ANYSEARCH_API_KEY',
      baseURL: 'https://api.anysearch.com',
      maxRenderedContentChars: 12_000,
    });
    expect(
      resolveConfig({ apiKeyEnv: ' CUSTOM_KEY ', baseURL: 'https://example.test/root/' }),
    ).toMatchObject({ apiKeyEnv: 'CUSTOM_KEY', baseURL: 'https://example.test/root/' });
    expect(() => resolveConfig({ apiKeyEnv: '   ' })).toThrow(
      'apiKeyEnv must be a non-empty credential reference',
    );
    expect(() => resolveConfig({ baseURL: 'ftp://example.test' })).toThrow(
      'baseURL must use HTTP or HTTPS',
    );
    expect(() => resolveConfig({ baseURL: 'not a URL' })).toThrow('baseURL must be an absolute URL');
  });
});
