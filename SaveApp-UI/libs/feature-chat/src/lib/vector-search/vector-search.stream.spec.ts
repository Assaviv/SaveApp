import { TextDecoder, TextEncoder } from 'util';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DATA_ACCESS_CONFIG } from '@save-app/data-access';
import { AuthService } from '@save-app/feature-security';
import { VectorSearchComponent } from './vector-search.component';

// The real module pulls in keycloak-js (ESM), which this lib's Jest setup doesn't transform
jest.mock('@save-app/feature-security', () => ({
  AuthService: class {},
  LoginRequiredComponent: class {},
}));

// jsdom has neither
Object.assign(globalThis, { TextEncoder, TextDecoder });

type WithWebFetch = { CapacitorWebFetch?: typeof fetch };

function sseResponse(body: string): Response {
  const bytes = new TextEncoder().encode(body);
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => {
        let sent = false;
        return {
          read: async () =>
            sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: bytes }),
        };
      },
    },
  } as unknown as Response;
}

describe('VectorSearchComponent streaming', () => {
  const win = window as unknown as WithWebFetch;

  function create() {
    TestBed.configureTestingModule({
      imports: [VectorSearchComponent],
      providers: [
        { provide: DATA_ACCESS_CONFIG, useValue: { apiBaseUrl: '/api/' } },
        {
          provide: AuthService,
          useValue: { getToken: async () => 'tok', authenticated: signal(true), hasAccess: true },
        },
      ],
    }).overrideComponent(VectorSearchComponent, { set: { imports: [], template: '' } });
    return TestBed.createComponent(VectorSearchComponent).componentInstance;
  }

  async function ask(component: VectorSearchComponent) {
    component.draft = 'what animals?';
    component.sendMessage();
    await new Promise((r) => setTimeout(r, 0));
    return component.messages[1];
  }

  afterEach(() => {
    delete win.CapacitorWebFetch;
    jest.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('accepts a final done event that has no terminating blank line', async () => {
    // What CapacitorHttp hands back: the whole body, trailing newlines trimmed
    win.CapacitorWebFetch = jest.fn().mockResolvedValue(
      sseResponse('event: cards\ndata: []\n\nevent: token\ndata: "No memories."\n\nevent: done\ndata: {}'),
    );
    const reply = await ask(create());

    expect(reply.text).toBe('No memories.');
  });

  it("prefers the WebView's own fetch over the CapacitorHttp-patched one", async () => {
    const patched = jest.fn();
    Object.assign(globalThis, { fetch: patched }); // stands in for the CapacitorHttp fetch
    win.CapacitorWebFetch = jest.fn().mockResolvedValue(sseResponse('event: done\ndata: {}\n\n'));
    await ask(create());

    expect(win.CapacitorWebFetch).toHaveBeenCalledWith('/api/RAG/search', expect.anything());
    expect(patched).not.toHaveBeenCalled();
  });
});
