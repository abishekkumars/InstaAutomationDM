export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv): string | null;
export function assertTestDatabaseUrl(rawUrl: string): void;
export function useTestDatabase(env?: NodeJS.ProcessEnv): string;
