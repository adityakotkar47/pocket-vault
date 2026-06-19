export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy apps/web/.env.example to apps/web/.env.local and fill it in.`,
    );
  }
  return value;
}
