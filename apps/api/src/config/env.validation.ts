export interface EnvConfig {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
}

const ALLOWED_NODE_ENVS: ReadonlyArray<EnvConfig['NODE_ENV']> = [
  'development',
  'test',
  'production',
];

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const rawNodeEnv = typeof config.NODE_ENV === 'string' ? config.NODE_ENV : 'development';
  if (!ALLOWED_NODE_ENVS.includes(rawNodeEnv as EnvConfig['NODE_ENV'])) {
    throw new Error(
      `Invalid NODE_ENV "${rawNodeEnv}". Expected one of: ${ALLOWED_NODE_ENVS.join(', ')}`,
    );
  }

  const rawPort = config.PORT;
  const port = rawPort === undefined || rawPort === '' ? 4000 : Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT "${String(rawPort)}". Expected an integer between 1 and 65535.`);
  }

  return { NODE_ENV: rawNodeEnv as EnvConfig['NODE_ENV'], PORT: port };
}
