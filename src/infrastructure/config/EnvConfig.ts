import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';

const schema = z.object({
  DASHBOARD_PORT: z.coerce.number().default(3000),
  DASHBOARD_PASSWORD: z.string().min(8),
  JWT_SECRET: z.string().min(32),
  DB_PATH: z.string().default('./data/jarvis.db'),
  WA_AUTH_PATH: z.string().default('./data/whatsapp-auth'),
  WA_AUTH_TYPE: z.enum(['qr', 'code']).default('qr'),
  WA_PHONE_NUMBER: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  DEFAULT_CWD: z.string().default(process.cwd()),
  COMMAND_TIMEOUT_SECONDS: z.coerce.number().default(60),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(10),
  INITIAL_MODE: z.enum(['ai', 'restricted', 'full-shell']).default('ai'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  ALLOWED_DEVICE_IDS: z.string().optional().default(''),
  CORS_ORIGINS: z.string().optional().default('http://localhost:3000'),
});

export type Config = z.infer<typeof schema>;

function loadEnvFile(path = '.env') {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join('=').trim();
    }
  }
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (_config) return _config;
  loadEnvFile();
  const result = schema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Configuración inválida en .env:');
    console.error(result.error.format());
    process.exit(1);
  }
  _config = result.data;
  return _config;
}
