# Dashboard Web

El dashboard está disponible en `http://localhost:3000` y proporciona una interfaz visual para gestionar JARVIS sin necesidad de usar la API directamente.

## Acceso

Al abrir el dashboard se muestra la pantalla de login:

```
┌────────────────────────────────────┐
│                                    │
│         ⚡ JARVIS                  │
│                                    │
│   ┌──────────────────────────┐     │
│   │ ●●●●●●●●●●●●●●●●●●●●●●  │     │
│   └──────────────────────────┘     │
│                                    │
│        [ Iniciar Sesión ]          │
│                                    │
└────────────────────────────────────┘
```

Ingresar la contraseña configurada en `DASHBOARD_PASSWORD`. El token JWT se guarda en `localStorage` y dura 24 horas.

## Navegación

El sidebar lateral tiene acceso a todas las secciones:

```
┌──────────┐
│ ⚡ JARVIS │
├──────────┤
│ 🏠 Home  │
│ ⬛ Terminal│
│ 👥 Operadores│
│ 🤖 Bots  │
│ ⚙️ Config │
└──────────┘
```

## Home

Página de resumen con métricas del sistema:

- **Bots activos**: cuántos de los bots configurados están conectados
- **Sesiones de shell**: cuántos operadores tienen una sesión activa
- **Comandos recientes**: tabla con los últimos comandos ejecutados (operador, comando, exit code, duración)

## Terminal

Visor de terminal en tiempo real usando xterm.js. Muestra el output de los comandos ejecutados por los operadores a medida que llega, con soporte completo de colores ANSI.

```
┌─────────────────────────────────────────────────┐
│ ● ● ●  Terminal                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  $ git status                                   │
│  On branch main                                 │
│  Your branch is up to date with 'origin/main'. │
│                                                 │
│  nothing to commit, working tree clean          │
│                                                 │
│  $ dir /b                                       │
│  src                                            │
│  dashboard                                      │
│  package.json                                   │
│  ...                                            │
│▌                                               │
└─────────────────────────────────────────────────┘
```

El terminal se auto-ajusta al tamaño de la ventana y auto-scrollea al último output.

## Operadores

Gestión completa de la whitelist de operadores autorizados.

### Lista de operadores

Tabla con todos los operadores registrados:

| Plataforma | Identificador | Nombre | Permisos | Estado | Acciones |
|---|---|---|---|---|---|
| WhatsApp | `521234@s.whatsapp.net` | Mi teléfono | `shell` | ✓ Activo | Editar / Eliminar |
| Telegram | `123456789` | PC trabajo | `shell` `ai` | ✗ Inactivo | Editar / Eliminar |

### Agregar operador

Formulario para registrar un nuevo operador:

1. **Plataforma**: `whatsapp` o `telegram`
2. **Identificador**:
   - WhatsApp: `521234567890@s.whatsapp.net`
   - Telegram: ID numérico (ej: `123456789`)
3. **Nombre**: nombre descriptivo (solo para identificarlo en el dashboard)
4. **Permisos**: checkboxes — `shell`, `ai`, `read-only`

### Habilitar/deshabilitar

El toggle en la columna Estado permite deshabilitar temporalmente un operador sin eliminarlo. Un operador deshabilitado recibe "No autorizado" al intentar usar el bot.

## Bots

Estado y gestión de las conexiones de mensajería.

### Tarjeta WhatsApp

**Estado: Desconectado** — muestra el QR para escanear:
```
┌─────────────────────────────┐
│ WhatsApp           ○ Desc.  │
├─────────────────────────────┤
│  [████ QR ████]             │
│  Escanear con tu teléfono   │
└─────────────────────────────┘
```

**Estado: Conectado** — muestra el número vinculado:
```
┌─────────────────────────────┐
│ WhatsApp           ● Conect.│
├─────────────────────────────┤
│  +52 123 456 7890           │
│  Vinculado hace 2h          │
│                             │
│  [ Desconectar ]            │
└─────────────────────────────┘
```

El QR se actualiza automáticamente vía WebSocket sin necesidad de recargar la página.

### Tarjeta Telegram

**Token no configurado** — muestra instrucciones para obtenerlo via BotFather.

**Conectado** — muestra el username del bot y un botón para desconectar.

## Settings (Configuración)

Control del modo de operación del sistema:

```
Modo de operación
○ AI       — Solo gemini y gh copilot
○ Restricted — Whitelist de comandos
● Full Shell — Acceso completo (actual)

[ Guardar ]
```

El cambio de modo es inmediato — no requiere reiniciar JARVIS. Los comandos siguientes ya usarán el nuevo modo.

> **Nota**: En la versión actual, los modos `ai` y `restricted` están definidos en la configuración pero el filtrado de comandos según el modo no está completamente implementado en `RouteMessageUseCase`. El modo `full-shell` siempre permite todo.

## Diseño visual

El dashboard usa un estilo **glassmorphism dark**:

| Token | Valor | Uso |
|---|---|---|
| Background | `#080810` | Fondo principal |
| Surface | `rgba(255,255,255,0.04)` + `blur(12px)` | Cards, paneles |
| Border | `rgba(255,255,255,0.08)` | Bordes de cards |
| Primary | `#00E5FF` | Acciones principales, activo |
| Success | `#00FF88` | Bot conectado, exit 0 |
| Warning | `#FFB800` | Modo restricted |
| Danger | `#FF4757` | Desconectado, errores |
| Font UI | Geist Sans / Inter | Texto de interfaz |
| Font Terminal | JetBrains Mono | Código, identificadores |

## Desarrollo del dashboard

Para trabajar en el dashboard con hot-reload:

```bash
# Terminal 1: backend
npm run dev

# Terminal 2: dashboard con Vite dev server (proxy al backend)
cd dashboard
npm run dev
```

El dashboard estará disponible en `http://localhost:5173` con proxy automático hacia `localhost:3000` para las rutas `/api` y `/ws`.

Para publicar cambios al dashboard servido por el backend:
```bash
cd dashboard && npm run build
```
