import { bootstrap } from './presentation/bootstrap.js';

bootstrap().catch((err) => {
  console.error('❌ JARVIS falló al iniciar:', err);
  process.exit(1);
});
