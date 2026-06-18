# Configuración

Todas las opciones se configuran en el archivo `.env` en la raíz del proyecto. JARVIS valida las variables al iniciar con Zod y falla rápido si falta algo requerido.

## Referencia completa de variables

### Dashboard

| Variable | Requerido | Default | Descripción |
|---|---|---|---|
| `DASHBOARD_PORT` | No | `3000` | Puerto HTTP del servidor |
| `DASHBOARD_PASSWORD` | Sí | — | Contraseña para acceder al dashboard |
| `JWT_SECRET` | Sí | — | Secreto para firmar tokens JWT. **Mínimo 32 caracteres.** |

> El token JWT dura 24 horas. Cambiar `JWT_SECRET` invalida todos los tokens activos.

### Base de datos

| Variable | Requerido | Default | Descripción |
|---|---|---|---|
| `DB_PATH` | No | `./data/jarvis.db` | Ruta al archivo SQLite. Se crea automáticamente si no existe. |

### WhatsApp

| Variable | Requerido | Default | Descripción |
|---|---|---|---|
| `WA_AUTH_PATH` | No | `./data/whatsapp-auth` | Carpeta donde Baileys guarda el estado de autenticación |
| `WA_AUTH_TYPE` | No | `qr` | `qr` — código QR / `code` — código numérico por SMS (ver abajo) |
| `WA_PHONE_NUMBER` | No | — | Solo necesario si `WA_AUTH_TYPE=code`. Número en formato internacional sin `+` (ej: `5212345678901`) |

**Diferencia entre modos de autenticación:**

- `qr`: el dashboard muestra un QR que se escanea con WhatsApp → Dispositivos vinculados
- `code`: WhatsApp envía un código numérico al teléfono. Útil si el teléfono no tiene cámara o si el QR falla

### Telegram

| Variable | Requerido | Default | Descripción |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | No | — | Token obtenido de @BotFather. Si se omite, el bot Telegram no inicia. |

### Terminal / Shell

| Variable | Requerido | Default | Descripción |
|---|---|---|---|
| `DEFAULT_CWD` | No | `C:\Users\USER` | Directorio de trabajo inicial para nuevas sesiones de shell |
| `COMMAND_TIMEOUT_SECONDS` | No | `60` | Segundos antes de que un comando se considere timeout. El proceso sigue corriendo pero JARVIS responde con el output hasta ese momento. |
| `RATE_LIMIT_PER_MINUTE` | No | `10` | Máximo de comandos por operador por minuto. Los comandos excedentes reciben "Espera un momento." |

### Modo de operación

| Variable | Requerido | Default | Descripción |
|---|---|---|---|
| `INITIAL_MODE` | No | `full-shell` | Modo al iniciar. Ver tabla de modos abajo. |

**Modos disponibles:**

| Modo | Descripción | Uso recomendado |
|---|---|---|
| `ai` | Solo comandos de IA (gemini, gh copilot) | Acceso mínimo, solo herramientas de AI |
| `restricted` | Whitelist de comandos (configurable) | Acceso controlado a comandos específicos |
| `full-shell` | Acceso completo a la terminal | Uso personal, máxima flexibilidad |

El modo actual puede cambiarse desde el dashboard (página Settings) o via API sin reiniciar.

### Logging

| Variable | Requerido | Default | Descripción |
|---|---|---|---|
| `LOG_LEVEL` | No | `info` | Nivel de log de Pino: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |

## Ejemplo de .env completo

```env
# ── Dashboard ──────────────────────────────
DASHBOARD_PORT=3000
DASHBOARD_PASSWORD=MiPasswordSuperSeguro2024
JWT_SECRET=una_cadena_muy_larga_y_aleatoria_para_jwt_32chars_minimo

# ── Base de datos ───────────────────────────
DB_PATH=./data/jarvis.db

# ── WhatsApp ────────────────────────────────
WA_AUTH_PATH=./data/whatsapp-auth
WA_AUTH_TYPE=qr
# WA_PHONE_NUMBER=5212345678901  # Solo para WA_AUTH_TYPE=code

# ── Telegram ────────────────────────────────
TELEGRAM_BOT_TOKEN=8989525132:AAHGIBxQr0XgUs-kbK0NavE-example

# ── Terminal ────────────────────────────────
DEFAULT_CWD=C:\Users\USER\source
COMMAND_TIMEOUT_SECONDS=120
RATE_LIMIT_PER_MINUTE=20

# ── Operación ───────────────────────────────
INITIAL_MODE=full-shell
LOG_LEVEL=info
```

## Seguridad recomendada

1. **`JWT_SECRET`**: generar con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
2. **`DASHBOARD_PASSWORD`**: usar un gestor de contraseñas, mínimo 16 caracteres
3. **`.env` en `.gitignore`**: nunca commitear credenciales al repositorio
4. **Red local**: JARVIS está pensado para uso en red local (casa/oficina), no exponer el puerto 3000 directamente a internet
5. **Operadores mínimos**: agregar solo los números/IDs estrictamente necesarios

## Variables de entorno del sistema

JARVIS hereda todas las variables de entorno del proceso padre cuando crea las sesiones de shell. Esto significa que herramientas como `gemini`, `gh copilot`, `claude` funcionan si están configuradas en el sistema — no es necesario configurar sus claves de API nuevamente.
