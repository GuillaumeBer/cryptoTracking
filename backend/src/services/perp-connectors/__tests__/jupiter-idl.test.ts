// Tests for Jupiter connector helpers.

jest.mock('node-fetch', () => {
  const mockFetch = jest.fn(() => Promise.resolve({ ok: true })) as jest.Mock;
  return { __esModule: true, default: mockFetch };
});

describe('Jupiter IDL coder', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('exposes camelCase account layouts for pool and custody', async () => {
    const { createJupiterAccountsCoder } = await import('../jupiter');
    const coder = createJupiterAccountsCoder() as unknown as { accountLayouts: Map<string, unknown> };

    const accountNames = Array.from(coder.accountLayouts.keys());

    expect(accountNames).toContain('pool');
    expect(accountNames).toContain('custody');
  });
});

describe('createJupiterRpcFetch', () => {
  const resetEnv = () => {
    delete process.env.JUPITER_SOLANA_RPC_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
  };

  beforeEach(() => {
    jest.resetModules();
    resetEnv();
  });

  async function setup() {
    const fetchModule = await import('node-fetch');
    const mockedFetch = fetchModule.default as unknown as jest.Mock;
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue({ ok: true } as any);
    const { createJupiterRpcFetch } = await import('../jupiter');
    return { mockedFetch, createJupiterRpcFetch };
  }

  it('returns native fetch when no proxy is configured', async () => {
    const { mockedFetch, createJupiterRpcFetch } = await setup();

    const rpcFetch = createJupiterRpcFetch();
    await rpcFetch('https://rpc.test', { method: 'POST' });

    expect(mockedFetch).toHaveBeenCalledWith('https://rpc.test', { method: 'POST' });
  });

  it('attaches a proxy agent when a proxy environment variable is set', async () => {
    process.env.HTTPS_PROXY = 'http://proxy:8080';
    const { mockedFetch, createJupiterRpcFetch } = await setup();

    const rpcFetch = createJupiterRpcFetch();
    await rpcFetch('https://rpc.test');

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockedFetch.mock.calls[0];
    expect(init).toBeDefined();
    expect((init as any).agent).toBeDefined();
    expect(((init as any).agent as { constructor: { name: string } }).constructor.name).toBe(
      'JupiterHttpsProxyAgent',
    );
  });
});
