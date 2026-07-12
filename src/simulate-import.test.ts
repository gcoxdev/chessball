import { expect, it, vi } from 'vitest';

it('imports the simulation API without executing the CLI', async () => {
  vi.resetModules();
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const api = await import('./simulate');

  expect(api.runCli).toBeTypeOf('function');
  expect(log).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  log.mockRestore();
  error.mockRestore();
});
