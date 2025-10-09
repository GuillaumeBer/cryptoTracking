import { createJupiterAccountsCoder } from '../jupiter';

describe('Jupiter IDL coder', () => {
  it('exposes camelCase account layouts for pool and custody', () => {
    const coder = createJupiterAccountsCoder() as unknown as { accountLayouts: Map<string, unknown> };
    const accountNames = Array.from(coder.accountLayouts.keys());

    expect(accountNames).toContain('pool');
    expect(accountNames).toContain('custody');
  });
});
