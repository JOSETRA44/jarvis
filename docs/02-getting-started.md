# Inicio Rápido

## Requisitos

- **Node.js 22+** (`node --version`)
- **PowerShell** (incluido en Windows 10/11)
- **WhatsApp** en el teléfono (para el bot de WA)
- **Bot de Telegram** creado con @BotFather (opcional)
- Una cuenta de WhatsApp **distinta** a la que usarás para controlar JARVIS (el bot necesita su propio número)

## 1. Instalar dependencias

```bash
cd C:\Users\USER\source\agentes\jarvis

# Backend
npm install

# Dashboard
cd dashboard && npm install && cd ..
```

## 2. Configurar variables de entorno

Crear `.env` en la raíz del proyecto:

```env
# Dashboard
DASHBOARD_PORT=3000
DASHBOARD_PASSWORD=tu_password_seguro
JWT_SECRET=cadena_aleatoria_de_minimo_32_caracteres_aqui

# Base de datos
DB_PATH=./data/jarvis.db

# WhatsApp
WA_AUTH_PATH=./data/whatsapp-auth
WA_AUTH_TYPE=qr

# Telegram (opcional — omitir si no se usa)
TELEGRAM_BOT_TOKEN=123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Terminal
DEFAULT_CWD=C:\Users\USER
COMMAND_TIMEOUT_SECONDS=60
RATE_LIMIT_PER_MINUTE=10

# Operación
INITIAL_MODE=full-shell
LOG_LEVEL=info
```

Ver [`04-configuration.md`](./04-configuration.md) para la referencia completa de variables.

## 3. Construir el dashboard

```bash
cd dashboard
npm run build
cd ..
```

Esto genera `dashboard/dist/` que Fastify sirve como archivos estáticos.

## 4. Iniciar JARVIS

```bash
npm run dev
```

Salida esperada:
```
🚀 JARVIS Dashboard: http://localhost:3000
INFO  Server listening at http://127.0.0.1:3000
INFO  Server listening at http://192.168.x.x:3000
```

## 5. Conectar WhatsApp

1. Abrir `http://localhost:3000` en el navegador
2. Hacer login con la contraseña configurada en `DASHBOARD_PASSWORD`
3. Ir a la página **Bots**
4. Aparecerá un QR code — escanearlo con WhatsApp (**Dispositivos vinculados → Vincular dispositivo**)
5. El estado cambia a "Conectado ✓"

> **Nota:** Si ya se escaneó el QR en una sesión anterior, WhatsApp reconecta automáticamente sin mostrar QR nuevo.

## 6. Conectar Telegram (opcional)

1. Hablar con [@BotFather](https://t.me/botfather) en Telegram
2. Enviar `/newbot`, seguir las instrucciones, copiar el token
3. Poner el token en `.env` como `TELEGRAM_BOT_TOKEN`
4. Reiniciar JARVIS — el bot Telegram inicia automáticamente

## 7. Agregar tu número como operador

Antes de poder enviar comandos, el número/ID debe estar en la whitelist:

**Desde el dashboard:**
1. Ir a **Operadores → Agregar operador**
2. Plataforma: `whatsapp` o `telegram`
3. Identificador:
   - WhatsApp: `521234567890@s.whatsapp.net` (código de país + número + `@s.whatsapp.net`)
   - Telegram: ID numérico (obtenerlo con [@userinfobot](https://t.me/userinfobot))
4. Nombre: cualquier nombre descriptivo
5. Permisos: seleccionar los necesarios
6. Guardar

**Desde la API:**
```bash
# Primero hacer login para obtener el token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"tu_password"}'

# Crear operador (usar el token recibido)
curl -X POST http://localhost:3000/api/operators \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "whatsapp",
    "identifier": "521234567890@s.whatsapp.net",
    "displayName": "Mi teléfono",
    "permissions": ["shell"]
  }'
```

## 8. Enviar el primer comando

Desde WhatsApp o Telegram, enviar al bot:

```
/help
```

Respuesta esperada:
```
🤖 JARVIS — SSH sobre WhatsApp/Telegram

Comandos especiales:
• /help · ? — esta ayuda
• /pwd — directorio actual
• /reset — reinicia tu shell
...
```

Luego probar un comando real:
```
dir /b
```

## Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run dev` | Inicia backend en modo watch (tsx watch) |
| `npm run build` | Compila TypeScript (esbuild) |
| `npm start` | Inicia el compilado (producción) |
| `cd dashboard && npm run dev` | Dashboard en modo dev (puerto 5173, proxy al 3000) |
| `cd dashboard && npm run build` | Compila dashboard para producción |

## Estructura de datos generada

```
data/
├── jarvis.db              # SQLite — operadores, sesiones, comandos
└── whatsapp-auth/         # Estado de autenticación de Baileys (no borrar)
    ├── creds.json
    └── *.json
```

> **Importante:** La carpeta `whatsapp-auth/` contiene las credenciales de la sesión de WhatsApp. Si se borra, habrá que escanear el QR de nuevo.
