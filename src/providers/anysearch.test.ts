import { afterEach, describe, expect, it, vi } from 'vitest';
import { anysearchProvider, executeAnySearch } from './anysearch.ts';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('anysearch provider metadata', () => {
  it('declares roles and availability', () => {
    expect(anysearchProvider.name).toBe('anysearch');
    expect(anysearchProvider.roles).toEqual(['search', 'fetch']);
    expect(anysearchProvider.isAvailable({ apiKey: 'as_sk_1' }, {}, 'search')).toBe(true);
    expect(anysearchProvider.isAvailable({}, { ANYSEARCH_API_KEY: 'as_sk_1' }, 'fetch')).toBe(true);
    expect(anysearchProvider.isAvailable({}, {}, 'search')).toBe(false);
    expect(anysearchProvider.defaultModel).toBe('anysearch-v1');
  });
});

describe('anysearch search mode', () => {
  it('executes search query and normalizes result into EngineOutput', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 0,
          message: 'success',
          request_id: 'req_search_1',
          data: {
            results: [
              {
                title: 'TypeScript Documentation',
                url: 'https://www.typescriptlang.org/docs',
                snippet: 'Handbook and reference.',
              },
            ],
            metadata: { total_results: 1, search_time_ms: 45 },
          },
        }),
      ),
    );

    const output = await executeAnySearch({
      mode: 'search',
      query: 'typescript handbook',
      timeoutMs: 10_000,
      settings: {
        apiKey: 'as_sk_test_1',
      },
    });

    const result = output.result as {
      summary: string;
      items: Array<{ title: string; url: string; snippet: string; source?: string }>;
      uncertainty: string[];
    };

    expect(result.summary).toContain('Handbook and reference.');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe('TypeScript Documentation');
    expect(result.items[0]?.url).toBe('https://www.typescriptlang.org/docs');
    expect(result.items[0]?.source).toBe('www.typescriptlang.org');
    expect(result.uncertainty).toEqual([]);
    expect(output.meta.usage).toEqual({ resultCount: 1 });
  });

  it('handles empty search results with descriptive uncertainty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 0,
          message: 'success',
          data: {
            results: [],
            metadata: { total_results: 0, search_time_ms: 10 },
          },
        }),
      ),
    );

    const output = await executeAnySearch({
      mode: 'search',
      query: 'nonexistent query 12345',
      timeoutMs: 10_000,
      settings: {},
    });

    const result = output.result as {
      summary: string;
      items: any[];
      uncertainty: string[];
    };

    expect(result.items).toHaveLength(0);
    expect(result.uncertainty).toContain('No results found for this query.');
  });
});

describe('anysearch fetch mode', () => {
  it('executes extract and returns cleaned content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 0,
          message: 'success',
          data: {
            url: 'https://example.com/page',
            title: 'Example Page',
            content: '# Example Page\n\nThis is the content with a [Link](https://example.com/sub).',
          },
        }),
      ),
    );

    const output = await executeAnySearch({
      mode: 'fetch',
      url: 'https://example.com/page',
      timeoutMs: 10_000,
      settings: {},
    });

    const result = output.result as {
      summary: string;
      content: string;
      links: Array<{ text: string; url: string }>;
      warnings: string[];
    };

    expect(result.summary).toBe('Example Page');
    expect(result.content).toContain('This is the content with a [Link]');
    expect(result.links).toEqual([{ text: 'Link', url: 'https://example.com/sub' }]);
    expect(result.warnings).toContain('Fetched via anysearch keyless extract service.');
  });

  it('blocks private and loopback targets from cloud extract', async () => {
    await expect(
      executeAnySearch({
        mode: 'fetch',
        url: 'http://127.0.0.1:8080/admin',
        timeoutMs: 5_000,
        settings: {},
      }),
    ).rejects.toThrow('Cannot fetch reserved or private network address');
  });
});
