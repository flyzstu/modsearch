import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANYSEARCH_CAPABILITIES_TOOL_NAME,
  ANYSEARCH_SEARCH_TOOL_NAME,
  AnySearchClient,
  formatAdvancedSearchOutput,
  formatDomains,
  formatSubDomains,
  parseAdvancedSearchArgs,
  parseCapabilityDomains,
  registerAdvancedSearchTool,
  registerCapabilitiesTool,
} from './index.ts';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function createTestHarness(apiKey?: string, baseURL: string = 'https://api.anysearch.test') {
  const registeredTools = new Map<string, any>();
  const ctx = {
    tools: {
      register: (tool: any) => {
        registeredTools.set(tool.name, tool);
      },
    },
  };

  const client = new AnySearchClient({
    resolveApiKey: () => Promise.resolve(apiKey),
    baseURL,
  });

  registerCapabilitiesTool(ctx, client);
  registerAdvancedSearchTool(ctx, client, 12_000);

  return {
    ctx,
    tools: registeredTools,
    async call(name: string, args: any, signal?: AbortSignal) {
      const tool = registeredTools.get(name);
      if (!tool) throw new Error(`Tool ${name} not registered`);
      return tool.execute(args, { signal });
    },
    render(name: string, args: any, value: any) {
      const tool = registeredTools.get(name);
      if (!tool) throw new Error(`Tool ${name} not registered`);
      return tool.output.render(args, value);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('anysearch_capabilities tool', () => {
  it('lists domains when no filter is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 0,
          message: 'success',
          request_id: 'req_domains',
          data: {
            domains: [{ domain: 'finance', description: 'Financial data', sub_domain_count: 2 }],
          },
        }),
      ),
    );
    const harness = createTestHarness('as_sk_test');

    const result = await harness.call(ANYSEARCH_CAPABILITIES_TOOL_NAME, {});

    expect(result).toEqual({
      kind: 'domains',
      requestId: 'req_domains',
      domains: [{ domain: 'finance', description: 'Financial data', subDomainCount: 2 }],
    });

    const rendered = harness.render(ANYSEARCH_CAPABILITIES_TOOL_NAME, {}, result);
    expect(rendered).toEqual([
      {
        type: 'text',
        text: 'Available AnySearch domains:\nRequest ID: req_domains\n- finance (2 sub-domains): Financial data',
      },
    ]);
  });

  it('trims and deduplicates requested domains while keeping first order', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        code: 0,
        message: 'success',
        data: { domains: [] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const harness = createTestHarness('as_sk_test');

    await harness.call(ANYSEARCH_CAPABILITIES_TOOL_NAME, {
      domains: [' finance ', 'legal', 'finance'],
    });

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anysearch.test/v1/sub-domains?domain=finance&domain=legal');
  });

  it('returns validated sub-domain parameters for the search call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 0,
          message: 'success',
          request_id: 'req_subdomains',
          data: {
            domains: [
              {
                domain: 'finance',
                description: 'Financial data',
                sub_domains: [
                  {
                    sub_domain: 'finance.us_stock',
                    description: 'US stocks',
                    params: {
                      ticker: { description: 'Ticker symbol', required: true, sort_order: 1 },
                    },
                  },
                ],
              },
            ],
          },
        }),
      ),
    );
    const harness = createTestHarness('as_sk_test');

    const result = await harness.call(ANYSEARCH_CAPABILITIES_TOOL_NAME, { domains: ['finance'] });

    expect(result).toEqual({
      kind: 'sub_domains',
      requestId: 'req_subdomains',
      domains: [
        {
          domain: 'finance',
          description: 'Financial data',
          subDomains: [
            {
              subDomain: 'finance.us_stock',
              description: 'US stocks',
              params: {
                ticker: { description: 'Ticker symbol', required: true, sortOrder: 1 },
              },
            },
          ],
        },
      ],
    });

    const rendered = harness.render(
      ANYSEARCH_CAPABILITIES_TOOL_NAME,
      { domains: ['finance'] },
      result,
    );
    expect(rendered[0].text).toContain('AnySearch vertical capabilities:');
    expect(rendered[0].text).toContain('- finance: Financial data');
    expect(rendered[0].text).toContain('ticker (required): Ticker symbol');
  });

  it('rejects empty, blank, or oversized domain lists before HTTP', () => {
    expect(() => parseCapabilityDomains([])).toThrow(
      'domains must contain at least one domain',
    );
    expect(() => parseCapabilityDomains(['  '])).toThrow(
      'domains must not contain blank values',
    );
    expect(() => parseCapabilityDomains(['a', 'b', 'c', 'd', 'e', 'f'])).toThrow(
      'domains must contain at most 5 domains',
    );
  });
});

describe('anysearch_search tool', () => {
  it('omits unrequested canonical content while rendering a concise source list', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        code: 0,
        message: 'success',
        request_id: 'req_search',
        data: {
          results: [
            {
              title: 'AAPL',
              url: 'https://finance.test/aapl',
              snippet: 'Latest quote',
              content: 'FULL_CONTENT_MUST_STAY_CANONICAL',
            },
          ],
          metadata: { total_results: 1, search_time_ms: 25 },
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const harness = createTestHarness('as_sk_managed');

    const result = await harness.call(ANYSEARCH_SEARCH_TOOL_NAME, {
      query: 'AAPL quote',
      maxResults: 5,
      tag: 'finance.us_stock',
      params: { ticker: 'AAPL', adjusted: true },
      zone: 'intl',
      language: 'en',
    });

    expect(result).toEqual({
      requestId: 'req_search',
      results: [
        {
          title: 'AAPL',
          url: 'https://finance.test/aapl',
          snippet: 'Latest quote',
        },
      ],
      metadata: { totalResults: 1, searchTimeMs: 25 },
      renderedContentTruncated: false,
    });

    const rendered = harness.render(ANYSEARCH_SEARCH_TOOL_NAME, { query: 'AAPL quote' }, result);
    expect(rendered[0].text).toContain('[AAPL](https://finance.test/aapl) — Latest quote');
    expect(rendered[0].text).not.toContain('FULL_CONTENT_MUST_STAY_CANONICAL');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ authorization: 'Bearer as_sk_managed' });
    expect(JSON.parse(init.body as string)).toEqual({
      query: 'AAPL quote',
      max_results: 5,
      tag: 'finance.us_stock',
      params: { ticker: 'AAPL', adjusted: true },
      zone: 'intl',
      language: 'en',
    });
  });

  it('caps rendered content independently of the larger canonical budget', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 0,
          message: 'success',
          data: {
            results: [{ title: 'A', url: 'https://a.test', content: '123456789' }],
            metadata: { total_results: 1, search_time_ms: 1 },
          },
        }),
      ),
    );
    const registeredTools = new Map<string, any>();
    const ctx = {
      tools: {
        register: (tool: any) => {
          registeredTools.set(tool.name, tool);
        },
      },
    };
    const client = new AnySearchClient({
      resolveApiKey: () => Promise.resolve('as_sk_test'),
      baseURL: 'https://api.anysearch.test',
    });
    registerAdvancedSearchTool(ctx, client, 5);

    const tool = registeredTools.get(ANYSEARCH_SEARCH_TOOL_NAME);
    const result = await tool.execute({ query: 'q', includeContent: true }, {});

    expect(result).toMatchObject({
      results: [{ content: '123456789' }],
      renderedContentTruncated: true,
    });
    const rendered = tool.output.render({ includeContent: true }, result);
    expect(rendered[0].text).toContain('12345');
    expect(rendered[0].text).not.toContain('123456');
    expect(rendered[0].text).toContain('Content truncated at 5 characters.');
  });

  it('rejects invalid parameters before sending HTTP', () => {
    expect(() => parseAdvancedSearchArgs({ query: '   ' })).toThrow(
      'query must be a non-empty string',
    );
    expect(() => parseAdvancedSearchArgs({ query: 'q', maxResults: 0 })).toThrow(
      'maxResults must be an integer from 1 to 20',
    );
    expect(() => parseAdvancedSearchArgs({ query: 'q', maxResults: 21 })).toThrow(
      'maxResults must be an integer from 1 to 20',
    );
    expect(() => parseAdvancedSearchArgs({ query: 'q', tag: '  ' })).toThrow(
      'tag must be a non-empty string when provided',
    );
    expect(() => parseAdvancedSearchArgs({ query: 'q', language: '  ' })).toThrow(
      'language must be a non-empty string when provided',
    );
    expect(() =>
      parseAdvancedSearchArgs({ query: 'q', params: { nested: ['not', 'scalar'] as any } }),
    ).toThrow('params.nested must be a string, finite number, or boolean');
  });

  it('preserves prototype-safe parameter parsing', () => {
    const params = JSON.parse('{"__proto__":"literal","constructor":true}');
    const parsed = parseAdvancedSearchArgs({ query: 'q', params });
    expect(Object.getPrototypeOf(parsed.request.params)).toBeNull();
    expect(parsed.request.params).toEqual(params);
  });
});
