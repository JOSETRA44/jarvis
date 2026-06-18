# JARVIS — Visión General

JARVIS es un controlador remoto de terminal vía WhatsApp y Telegram. Funciona como un **SSH amigable sobre mensajería**: permite ejecutar comandos de terminal desde el teléfono, con sesiones persistentes que mantienen el directorio de trabajo entre comandos.

## ¿Qué puede hacer?

- Enviar `cd source\mi-proyecto` desde WhatsApp y que el siguiente `git status` se ejecute ahí
- Lanzar `gemini "explica este error"` y recibir la respuesta en el chat
- Abrir un REPL de Node.js con `!node` y escribir código línea a línea desde el celular
- Ver el output en tiempo real en el dashboard web mientras el comando corre
- Gestionar qué números de WhatsApp / cuentas de Telegram tienen acceso

## Componentes

```
┌─────────────┐     mensajes     ┌────────────────┐
│  WhatsApp   │◄────────────────►│                │
└─────────────┘                  │   JARVIS       │
                                 │   Backend      │     ┌──────────┐
┌─────────────┐     mensajes     │   (Fastify)    │────►│ PowerShell│
│  Telegram   │◄────────────────►│                │     │ Session  │
└─────────────┘                  └───────┬────────┘     └──────────┘
                                         │ WebSocket
                                 ┌───────▼────────┐
                                 │   Dashboard    │
                                 │   (React)      │
                                 └────────────────┘
```

| Componente | Rol |
|---|---|
| **WhatsApp (Baileys)** | Recibe y envía mensajes de WhatsApp Web |
| **Telegram (grammy)** | Bot de Telegram en modo polling |
| **Backend (Fastify)** | API REST + WebSocket + serving del dashboard |
| **ShellSession** | Proceso PowerShell persistente por operador |
| **Dashboard (React)** | Gestión de operadores, bots, historial, terminal live |
| **SQLite** | Persistencia de operadores, sesiones y comandos |

## Flujo de un mensaje

```
Usuario WhatsApp/Telegram
        │
        ▼  "git status"
[Adapter WA/TG] ──► RouteMessageUseCase
                            │
                     ¿Autorizado?  ──► No → "No autorizado"
                            │
                     ¿Rate limit?  ──► Sí → "Espera un momento"
                            │
                     ShellSession.execute("git status")
                            │
                     PowerShell wrapper (cmd /c git status)
                            │
                     output + exitCode + cwd
                            │
                     ✅ `git status`   (respuesta formateada)
                     📂 `C:\mi-proyecto`
                     ```
                     On branch main
                     nothing to commit
                     ```
                     ⏱ 342ms · exit 0
```

## Stack tecnológico

| Capa | Tecnología | Por qué |
|---|---|---|
| Runtime | Node.js 22 + TypeScript | Necesario para Baileys; soporte nativo Windows |
| API Server | Fastify 5 | 3× más rápido que Express, schema validation nativa |
| WhatsApp | Baileys v7 | Librería de WhatsApp Web más activa |
| Telegram | grammy | TypeScript-nativo, mejor tipado que Telegraf |
| Shell | PowerShell (NonInteractive) | Sin echo de comandos, CWD persistente, compatibilidad cmd |
| Base de datos | SQLite + Drizzle ORM | Embebido, cero dependencias externas |
| Dashboard | React 19 + Vite + TailwindCSS | Productividad máxima, bundle pequeño |
| Terminal web | xterm.js | Emulación real de terminal en el browser |
| WebSocket | @fastify/websocket | Output en tiempo real al dashboard |

## Limitaciones conocidas

- **`cd` en comandos compuestos**: `rmdir temp && cd ..` elimina el directorio pero no cambia el CWD persistente. Enviar `cd` como comando separado.
- **Comandos con flags específicos de PowerShell**: el shell usa `cmd /c` internamente, así que la sintaxis es de cmd.exe (`dir /b`, `type archivo`, etc.). Para cmdlets de PS, prefijan con `powershell -c`.
- **Herramientas interactivas**: `!gemini`, `!node` entran en modo interactivo (passthrough I/O). Usar `!exit` para salir.
- **Sin TTY real**: programas que requieren un terminal real (algunos instaladores, vim) pueden no funcionar bien.
