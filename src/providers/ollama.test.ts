import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiKeyFailureError } from '../util/apiKeys.ts';
import { findEngine } from './index.ts';
import { executeOllama } from './ollama.ts';

function mockFetchJson(
  data: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {},
): Array<{ url: string; init: RequestInit }> {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn(async (input: string | URL | Request, requestInit?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init: requestInit ?? {} });
    const ok = init.ok ?? (init.status ? init.status >= 200 && init.status < 300 : true);
    const status = init.status ?? 200;
    const statusText = init.statusText ?? (ok ? 'OK' : 'Error');
    return {
      ok,
      status,
      statusText,
      json: async () => data,
      text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
    } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

describe('ollama provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves under its canonical name and aliases', () => {
    expect(findEngine('ollama')?.name).toBe('ollama');
    expect(findEngine('ollama-search')?.name).toBe('ollama');
    expect(findEngine('ollama')?.roles).toEqual(['search', 'fetch']);
  });

  it('explains how to set the key when search has none', async () => {
    await expect(
      executeOllama({
        mode: 'search',
        query: 'q',
        timeoutMs: 1000,
        settings: {},
      }),
    ).rejects.toThrow(/needs an API key.*OLLAMA_API_KEY.*modsearch config set ollama\.apiKey/);
  });

  it('explains how to set the key when fetch has none', async () => {
    await expect(
      executeOllama({
        mode: 'fetch',
        url: 'https://example.com',
        timeoutMs: 1000,
        settings: {},
      }),
    ).rejects.toThrow(/needs an API key.*OLLAMA_API_KEY.*modsearch config set ollama\.apiKey/);
  });

  it('requires a URL for fetch mode', async () => {
    await expect(
      executeOllama({
        mode: 'fetch',
        timeoutMs: 1000,
        settings: { apiKey: 'test-key' },
      }),
    ).rejects.toThrow(/Fetch mode requires a URL/);
  });

  it('sends the query, max_results, and Bearer token on search', async () => {
    const calls = mockFetchJson({
      results: [
        {
          title: 'Ollama Guide',
          url: 'https://example.com/guide',
          content: 'Ollama is a tool for running models locally.',
        },
      ],
    });

    const parsed = await executeOllama({
      mode: 'search',
      query: 'ollama guide',
      maxResults: 5,
      timeoutMs: 1000,
      settings: { apiKey: 'test-key' },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://ollama.com/api/web_search');
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      query: 'ollama guide',
      max_results: 5,
    });

    const result = parsed.result as {
      summary: string;
      items: Array<{ title: string; url: string; snippet: string; source?: string }>;
      uncertainty: string[];
      warnings: string[];
    };
    expect(result.summary).toContain('Ollama returned 1 ranked result(s)');
    expect(result.items).toEqual([
      {
        title: 'Ollama Guide',
        url: 'https://example.com/guide',
        snippet: 'Ollama is a tool for running models locally.',
        source: 'example.com',
      },
    ]);
    expect(result.uncertainty).toEqual([]);
    expect(result.warnings[0]).toContain(
      'Ollama search returns ranked results without an LLM summary',
    );
  });

  it('clamps max_results between 1 and 10 on search', async () => {
    const calls = mockFetchJson({ results: [] });

    await executeOllama({
      mode: 'search',
      query: 'q',
      maxResults: 50,
      timeoutMs: 1000,
      settings: { apiKey: 'test-key' },
    });
    expect(JSON.parse(calls[0].init.body as string).max_results).toBe(10);

    await executeOllama({
      mode: 'search',
      query: 'q',
      maxResults: 0,
      timeoutMs: 1000,
      settings: { apiKey: 'test-key' },
    });
    expect(JSON.parse(calls[1].init.body as string).max_results).toBe(1);
  });

  it('handles empty search results with uncertainty note', async () => {
    mockFetchJson({ results: [] });
    const parsed = await executeOllama({
      mode: 'search',
      query: 'nonexistent query',
      timeoutMs: 1000,
      settings: { apiKey: 'test-key' },
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

  it('fetches page content, title, and links on fetch mode', async () => {
    const calls = mockFetchJson({
      title: 'Example Domain',
      content: 'This domain is for use in illustrative examples in documents.',
      links: ['https://www.iana.org/domains/example', 'https://example.com/sub'],
    });

    const parsed = await executeOllama({
      mode: 'fetch',
      url: 'https://example.com',
      timeoutMs: 1000,
      settings: { apiKey: 'test-key' },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://ollama.com/api/web_fetch');
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      url: 'https://example.com/',
    });

    const result = parsed.result as {
      summary: string;
      content: string;
      links: Array<{ text: string; url: string }>;
      warnings: string[];
    };
    expect(result.summary).toBe('Example Domain');
    expect(result.content).toBe('This domain is for use in illustrative examples in documents.');
    expect(result.links).toEqual([
      { text: 'https://www.iana.org/domains/example', url: 'https://www.iana.org/domains/example' },
      { text: 'https://example.com/sub', url: 'https://example.com/sub' },
    ]);
    expect(result.warnings[0]).toContain('Fetched through Ollama in the cloud');
  });

  it('refuses to fetch literal reserved/private target URLs', async () => {
    await expect(
      executeOllama({
        mode: 'fetch',
        url: 'http://127.0.0.1:8080/admin',
        timeoutMs: 1000,
        settings: { apiKey: 'test-key' },
      }),
    ).rejects.toThrow(/does not fetch the private or reserved target/);
  });

  it('honors a custom baseURL', async () => {
    const calls = mockFetchJson({ results: [] });
    await executeOllama({
      mode: 'search',
      query: 'q',
      timeoutMs: 1000,
      settings: { apiKey: 'test-key', baseURL: 'https://my-ollama-proxy.internal/v1' },
    });
    expect(calls[0].url).toBe('https://my-ollama-proxy.internal/v1/api/web_search');
  });

  it('surfaces 401/403 as an ApiKeyFailureError', async () => {
    mockFetchJson({ message: 'Unauthorized: Invalid API Key' }, { ok: false, status: 401 });
    await expect(
      executeOllama({
        mode: 'search',
        query: 'q',
        timeoutMs: 1000,
        settings: { apiKey: 'bad-key' },
      }),
    ).rejects.toBeInstanceOf(ApiKeyFailureError);
  });

  it('surfaces 429 as an ApiKeyFailureError for rate-limiting', async () => {
    mockFetchJson({ message: 'Rate limit exceeded' }, { ok: false, status: 429 });
    await expect(
      executeOllama({
        mode: 'search',
        query: 'q',
        timeoutMs: 1000,
        settings: { apiKey: 'rate-limited-key' },
      }),
    ).rejects.toBeInstanceOf(ApiKeyFailureError);
  });

  it('surfaces 500 response as a standard Error', async () => {
    mockFetchJson({ message: 'Internal server error' }, { ok: false, status: 500 });
    await expect(
      executeOllama({
        mode: 'search',
        query: 'q',
        timeoutMs: 1000,
        settings: { apiKey: 'test-key' },
      }),
    ).rejects.toThrow(/ollama returned 500/);
  });

  it('redacts every configured key from error messages', async () => {
    const first = 'ollama-secret-1';
    const second = 'ollama-secret-2';
    mockFetchJson({ detail: `Failed key: ${first} and ${second}` }, { ok: false, status: 401 });

    let caughtError: Error | undefined;
    try {
      await executeOllama({
        mode: 'search',
        query: 'q',
        timeoutMs: 1000,
        settings: { apiKey: `${first}, ${second}` },
      });
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError?.message).not.toContain(first);
    expect(caughtError?.message).not.toContain(second);
  });

  it('aborts the underlying request on timeout', async () => {
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
      executeOllama({
        mode: 'search',
        query: 'q',
        timeoutMs: 20,
        settings: { apiKey: 'test-key' },
      }),
    ).rejects.toThrow(/ollama timed out after 20 ms/);
    expect(sawAbort).toBe(true);
  });
});
