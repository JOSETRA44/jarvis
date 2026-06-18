# JARVIS — Documentación

Sistema de control remoto de terminal vía WhatsApp y Telegram, con dashboard web de administración.

## Índice

| Documento | Descripción |
|---|---|
| [01 — Visión General](./01-overview.md) | Qué es JARVIS, componentes, stack tecnológico, flujo de mensajes |
| [02 — Inicio Rápido](./02-getting-started.md) | Instalación, configuración inicial, primer comando |
| [03 — Arquitectura](./03-architecture.md) | Clean Architecture + DDD, estructura de carpetas, entidades, DI |
| [04 — Configuración](./04-configuration.md) | Todas las variables de `.env` explicadas |
| [05 — Comandos de Shell](./05-shell-commands.md) | Comandos especiales, modo interactivo, CWD, rate limiting |
| [06 — Mensajeros](./06-messengers.md) | Setup de WhatsApp (QR/código) y Telegram (BotFather) |
| [07 — API REST](./07-api-reference.md) | Endpoints REST + protocolo WebSocket + ejemplos curl |
| [08 — Dashboard](./08-dashboard.md) | Guía de uso del dashboard web |
| [09 — ShellSession Internals](./09-shell-session-internals.md) | Cómo funciona el motor de shell por dentro |

## Inicio rápido en 3 pasos

```bash
# 1. Instalar
npm install && cd dashboard && npm install && npm run build && cd ..

# 2. Configurar (copiar y editar)
cp .env.example .env

# 3. Iniciar
npm run dev
```

Abrir `http://localhost:3000`, conectar WhatsApp desde la página Bots, agregar tu número en Operadores, y enviar `/help` al bot.

## Arquitectura en una línea

```
WhatsApp/Telegram → RouteMessageUseCase → ShellSession (PowerShell) → respuesta formateada
                                                    ↓
                                            WebSocket → Dashboard
```
