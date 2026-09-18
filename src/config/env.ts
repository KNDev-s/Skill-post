export function parseConfig(env: Record<string, unknown>) {
  const mode = env.VITE_SERVICE_MODE ?? (env.DEV ? 'mock' : 'api');
  if (mode !== 'mock' && mode !== 'api') throw new Error('VITE_SERVICE_MODE deve ser mock ou api.');
  const baseUrl = String(env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
  if (!/^https?:\/\/[^/]+/.test(baseUrl) && !/^\/(?!\/)/.test(baseUrl))
    throw new Error('VITE_API_BASE_URL deve ser uma URL HTTP(S) ou um caminho como /api/v1.');
  const credentials = env.VITE_API_CREDENTIALS || 'same-origin';
  if (credentials !== 'same-origin' && credentials !== 'include')
    throw new Error('Credenciais inválidas.');
  function positive(value: unknown, fallback: number) {
    const parsed = value === undefined || value === '' ? fallback : Number(value);
    if (!Number.isFinite(parsed) || parsed < 100)
      throw new Error('Intervalos devem ser números de pelo menos 100 ms.');
    return parsed;
  }
  return {
    mode,
    baseUrl,
    credentials,
    timeoutMs: positive(env.VITE_API_TIMEOUT_MS, 30000),
    pollIntervalMs: positive(env.VITE_POLL_INTERVAL_MS, 2000),
  } as const;
}
export const config = parseConfig(import.meta.env);
