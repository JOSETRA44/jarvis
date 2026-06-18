# Arquitectura

JARVIS sigue **Clean Architecture + DDD** (Domain-Driven Design). La regla central es la de dependencia: las capas internas no conocen nada de las capas externas.

```
┌─────────────────────────────────────────────┐
│  Presentation (Fastify, React, WebSocket)   │  ← Capa 4: Puntos de entrada
├─────────────────────────────────────────────┤
│  Infrastructure (DB, Baileys, grammy, PS)   │  ← Capa 3: Implementaciones
├─────────────────────────────────────────────┤
│  Application (Use Cases)                    │  ← Capa 2: Casos de uso
├─────────────────────────────────────────────┤
│  Domain (Entities, Ports/Interfaces)        │  ← Capa 1: Núcleo del negocio
└─────────────────────────────────────────────┘
```

Las flechas de dependencia apuntan siempre **hacia adentro**: Presentation → Infrastructure → Application → Domain.

## Estructura de carpetas

```
jarvis/
├── src/
│   ├── domain/
│   │   ├── entities/           # Entidades del dominio
│   │   │   ├── Operator.ts     # Operador autorizado
│   │   │   ├── Session.ts      # Sesión de shell activa
│   │   │   ├── Command.ts      # Registro de comando ejecutado
│   │   │   └── BotConnection.ts# Estado de bot (WA/TG)
│   │   └── ports/              # Interfaces (contratos)
│   │       ├── IMessengerAdapter.ts   # Abstracción WA/TG
│   │       ├── IOperatorRepository.ts
│   │       ├── ISessionRepository.ts
│   │       ├── ICommandRepository.ts
│   │       └── ITerminalExecutor.ts
│   │
│   ├── application/
│   │   ├── AuthorizeOperator/
│   │   │   └── AuthorizeOperatorUseCase.ts
│   │   └── RouteMessage/
│   │       └── RouteMessageUseCase.ts  # ← Orquestador principal
│   │
│   ├── infrastructure/
│   │   ├── terminal/
│   │   │   ├── ShellSession.ts     # PowerShell persistente
│   │   │   └── SessionManager.ts   # Pool de sesiones por operador
│   │   ├── messengers/
│   │   │   ├── WhatsAppAdapter.ts  # Baileys v7
│   │   │   └── TelegramAdapter.ts  # grammy
│   │   ├── database/
│   │   │   ├── client.ts           # SQLite + Drizzle init
│   │   │   ├── schema.ts           # Tablas ORM
│   │   │   ├── OperatorRepo.ts
│   │   │   ├── SessionRepo.ts
│   │   │   └── CommandRepo.ts
│   │   ├── config/
│   │   │   ├── EnvConfig.ts        # Zod validation de .env
│   │   │   └── ModeManager.ts      # Modo de operación
│   │   └── security/
│   │       └── RateLimiter.ts      # Límite por operador
│   │
│   └── presentation/
│       ├── api/
│       │   ├── server.ts           # Fastify instance
│       │   ├── routes/
│       │   │   ├── auth.ts         # POST /api/auth/login
│       │   │   ├── operators.ts    # CRUD /api/operators
│       │   │   ├── commands.ts     # GET  /api/commands
│       │   │   ├── bots.ts         # GET/POST /api/bots
│       │   │   └── config.ts       # GET/PUT /api/config
│       │   └── middleware/
│       │       └── authGuard.ts    # JWT middleware
│       ├── ws/
│       │   └── terminal.ws.ts      # WebSocket broadcaster
│       └── bootstrap.ts            # Dependency Injection manual
│
├── dashboard/                      # SPA React (Vite)
│   └── src/
│       ├── pages/                  # Login, Terminal, Operators, Bots, Settings, Home
│       ├── components/             # Layout, GlassCard, StatusBadge
│       └── lib/
│           ├── api.ts              # Cliente HTTP tipado
│           └── ws.ts               # Cliente WebSocket
│
└── data/                           # Generado en runtime (gitignored)
    ├── jarvis.db
    └── whatsapp-auth/
```

## Entidades del dominio

### Operator
Representa un usuario autorizado para enviar comandos.

```typescript
interface Operator {
  id: string;
  platform: 'whatsapp' | 'telegram';
  identifier: string;     // ej: 521234567890@s.whatsapp.net
  displayName: string;
  permissions: string[];  // ['shell', 'ai', ...]
  enabled: boolean;
  createdAt: string;
}
```

### Session
Sesión de shell activa para un operador.

```typescript
interface Session {
  id: string;
  operatorId: string;
  platform: 'whatsapp' | 'telegram';
  pid: number | null;
  cwd: string;            // directorio actual del shell
  status: 'active' | 'idle' | 'closed';
  createdAt: string;
  lastActivityAt: string;
}
```

### Command
Registro inmutable de un comando ejecutado.

```typescript
interface Command {
  id: string;
  sessionId: string;
  operatorId: string;
  input: string;          // texto enviado por el operador
  output: string;         // respuesta completa
  exitCode: number;
  durationMs: number;
  executedAt: string;
}
```

## Casos de uso

### `AuthorizeOperatorUseCase`
Dado `(platform, identifier)`, busca el operador en la base de datos, verifica que esté habilitado y retorna el objeto `Operator` o `null`.

### `RouteMessageUseCase`
El orquestador principal. Recibe un `IncomingMessage` y un `IMessengerAdapter` y:

1. Llama a `AuthorizeOperatorUseCase` — si falla, responde "No autorizado"
2. Detecta modo interactivo activo → pasa el texto directo al proceso
3. Maneja comandos especiales (`/help`, `/pwd`, `/reset`, `/status`)
4. Detecta prefijo `!` → entra en modo interactivo passthrough
5. Verifica rate limiting
6. Ejecuta en `ShellSession` → formatea y responde

## Inyección de dependencias

JARVIS usa **DI manual** (sin framework) en `bootstrap.ts`:

```typescript
// bootstrap.ts — wiring de todas las dependencias
const db = getDb(config.DB_PATH);
const operatorRepo = new OperatorRepo(db);
const sessionMgr = new SessionManager(config.DEFAULT_CWD);
const authorizeUC = new AuthorizeOperatorUseCase(operatorRepo);
const routeUC = new RouteMessageUseCase(authorizeUC, sessionMgr, ...);

waAdapter.onMessage(async (msg) => {
  await routeUC.handle(msg, waAdapter);
});
```

## WebSocket — protocolo de mensajes

El servidor emite tres tipos de mensajes JSON sobre el WebSocket (`/ws/terminal`):

```typescript
// Output de un comando en tiempo real
{ type: 'output', operatorId: string, chunk: string }

// QR de WhatsApp para mostrar en el dashboard
{ type: 'qr', dataUrl: string }

// Cambio de estado de un bot
{ type: 'bot_status', platform: 'whatsapp'|'telegram', status: string }
```

El cliente (dashboard) puede suscribirse a un operador específico enviando:
```json
{ "subscribe": "operatorId" }
```

## Flujo de autenticación del dashboard

```
Browser                   Fastify
  │                          │
  │  POST /api/auth/login     │
  │  { password: "..." }      │
  │ ─────────────────────────►│
  │                          │ bcrypt compare
  │  { token: "JWT..." }      │
  │ ◄─────────────────────────│
  │                          │
  │  GET /api/operators       │
  │  Authorization: Bearer JWT│
  │ ─────────────────────────►│
  │                          │ verify JWT
  │  [{ id, platform, ... }] │
  │ ◄─────────────────────────│
```

El JWT tiene validez de 24 horas y se almacena en `localStorage`. No hay refresh automático — al expirar, el dashboard redirige al login.
