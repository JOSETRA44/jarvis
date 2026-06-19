import { getConfig } from '../infrastructure/config/EnvConfig.js';
import { getDb, runMigrations } from '../infrastructure/database/client.js';
import { OperatorRepo } from '../infrastructure/database/OperatorRepo.js';
import { SessionRepo } from '../infrastructure/database/SessionRepo.js';
import { CommandRepo } from '../infrastructure/database/CommandRepo.js';
import { SessionManager } from '../infrastructure/terminal/SessionManager.js';
import type { IMessengerAdapter } from '../domain/ports/IMessengerAdapter.js';
import { WhatsAppAdapter } from '../infrastructure/messengers/WhatsAppAdapter.js';
import { TelegramAdapter } from '../infrastructure/messengers/TelegramAdapter.js';
import { AuthorizeOperatorUseCase } from '../application/AuthorizeOperator/AuthorizeOperatorUseCase.js';
import { RouteMessageUseCase } from '../application/RouteMessage/RouteMessageUseCase.js';
import { RateLimiter } from '../infrastructure/security/RateLimiter.js';
import { ModeManager } from '../infrastructure/config/ModeManager.js';
import { buildServer } from './api/server.js';
import { registerTerminalWS, broadcastOutput, broadcastQR, broadcastBotStatus } from './ws/terminal.ws.js';
import { registerMobileWS } from './ws/mobile.ws.js';
import { authRoutes } from './api/routes/auth.js';
import { operatorRoutes } from './api/routes/operators.js';
import { commandRoutes } from './api/routes/commands.js';
import { botRoutes } from './api/routes/bots.js';
import { configRoutes } from './api/routes/config.js';

export async function bootstrap() {
  const config = getConfig();
  const db = getDb(config.DB_PATH);
  runMigrations(db);

  const operatorRepo = new OperatorRepo(db);
  const sessionRepo = new SessionRepo(db);
  const commandRepo = new CommandRepo(db);

  // One persistent shell per operator (stateful: cd persists between commands)
  const sessionMgr = new SessionManager(config.DEFAULT_CWD);
  const rateLimiter = new RateLimiter(config.RATE_LIMIT_PER_MINUTE);
  const modeManager = new ModeManager(config.INITIAL_MODE);

  const authorizeUC = new AuthorizeOperatorUseCase(operatorRepo);

  const latestQR: { dataUrl: string | null } = { dataUrl: null };
  const adapters: IMessengerAdapter[] = [];

  const waAdapter = new WhatsAppAdapter(
    config.WA_AUTH_PATH,
    config.WA_AUTH_TYPE,
    config.WA_PHONE_NUMBER,
    (qr) => {
      latestQR.dataUrl = qr;
      broadcastQR(qr);
    }
  );
  adapters.push(waAdapter);

  if (config.TELEGRAM_BOT_TOKEN) {
    adapters.push(new TelegramAdapter(config.TELEGRAM_BOT_TOKEN));
  }

  const routeUC = new RouteMessageUseCase(
    authorizeUC,
    sessionMgr,
    commandRepo,
    sessionRepo,
    rateLimiter,
    broadcastOutput
  );

  for (const adapter of adapters) {
    adapter.onMessage(async (msg) => {
      await routeUC.handle(msg, adapter);
    });
    adapter.onStatusChange((s) => {
      broadcastBotStatus(s.platform, s.status);
    });
    adapter.onCallbackQuery?.((queryId, from, data) => {
      return routeUC.handleCallback(queryId, from, data, adapter);
    });
  }

  const app = await buildServer(config);
  registerTerminalWS(app);
  registerMobileWS(app, sessionMgr);

  await authRoutes(app, config.DASHBOARD_PASSWORD);
  await operatorRoutes(app, operatorRepo);
  await commandRoutes(app, commandRepo);
  await botRoutes(app, adapters, latestQR);
  await configRoutes(app, modeManager);

  await app.listen({ port: config.DASHBOARD_PORT, host: '0.0.0.0' });
  console.log(`\n🚀 JARVIS Dashboard: http://localhost:${config.DASHBOARD_PORT}`);

  for (const adapter of adapters) {
    adapter.connect().catch((err) => {
      console.error(`[${adapter.platform}] Error al conectar:`, err);
    });
  }

  // Clean up shells on exit
  process.on('SIGINT', () => { sessionMgr.killAll(); process.exit(0); });
  process.on('SIGTERM', () => { sessionMgr.killAll(); process.exit(0); });

  return { app, adapters, modeManager, sessionMgr };
}
