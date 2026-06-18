# Mensajeros: WhatsApp y Telegram

## WhatsApp

JARVIS usa [Baileys v7](https://github.com/WhiskeySockets/Baileys) para conectarse a WhatsApp Web. Baileys emula la sesión web de WhatsApp — no requiere API oficial ni pago.

### Requisitos

- Un número de WhatsApp **dedicado al bot** (distinto al número desde el que se controla JARVIS)
- Si se usa una SIM secundaria: la app de WhatsApp debe estar instalada al menos una vez para activar el número

### Proceso de vinculación (QR)

1. Iniciar JARVIS (`npm run dev`)
2. Abrir el dashboard en `http://localhost:3000`
3. Ir a la página **Bots**
4. Aparece la tarjeta de WhatsApp con el QR:

```
┌─────────────────────────────┐
│ WhatsApp                    │
│ ○ Desconectado              │
│                             │
│  [█████████████████████]    │
│  [██ QR code imagen ███]    │
│  [█████████████████████]    │
│                             │
│  Escanear con WhatsApp      │
│  Dispositivos vinculados    │
└─────────────────────────────┘
```

5. En el teléfono (del número del BOT): WhatsApp → ⋮ → Dispositivos vinculados → Vincular dispositivo
6. Escanear el QR
7. El estado cambia a "Conectado ✓" y el QR desaparece

### Vinculación por código (alternativa al QR)

Si el teléfono no tiene cámara disponible o el QR no funciona:

1. En `.env` cambiar: `WA_AUTH_TYPE=code`
2. Agregar: `WA_PHONE_NUMBER=521234567890` (código de país + número, sin `+`)
3. Reiniciar JARVIS
4. WhatsApp enviará un código de 8 dígitos al número configurado
5. El código aparece en los logs del servidor y en la tarjeta de bots del dashboard

### Formato del identificador de operador (WhatsApp)

```
521234567890@s.whatsapp.net
│││││││││││││
│└──────────┘└─────────────── sufijo fijo para usuarios
│
└─ código de país + número (sin espacios, sin +, sin guiones)

Ejemplos:
  México: 5215512345678@s.whatsapp.net
  USA:    12025551234@s.whatsapp.net
  España: 34612345678@s.whatsapp.net
```

Para obtener el identificador exacto, el número puede enviar cualquier mensaje al bot — el identificador aparece en los logs:
```
[WhatsApp] Mensaje de: 521234567890@s.whatsapp.net → "hola"
```

### Reconexión automática

Si WhatsApp se desconecta (timeout, pérdida de red), JARVIS intenta reconectar automáticamente después de 5 segundos. Si la sesión fue cerrada manualmente (desde el teléfono → Dispositivos vinculados → Cerrar sesión), no reconecta y hay que escanear el QR de nuevo.

El estado de reconexión se emite en tiempo real al dashboard vía WebSocket.

### Guardar la sesión

El estado de autenticación se guarda en `WA_AUTH_PATH` (por defecto `./data/whatsapp-auth/`). **No borrar esta carpeta** — contiene las credenciales de la sesión. Si se borra, hay que escanear el QR nuevamente.

---

## Telegram

JARVIS usa [grammy](https://grammy.dev/) en **modo polling** (no webhook). Polling es ideal para uso local: no requiere dominio público ni HTTPS.

### Crear un bot de Telegram

1. Hablar con [@BotFather](https://t.me/botfather) en Telegram
2. Enviar `/newbot`
3. Seguir las instrucciones (nombre del bot y username terminado en `bot`)
4. BotFather responde con el token:
   ```
   Done! Congratulations on your new bot. You will find it at t.me/tu_bot.
   Use this token to access the HTTP API:
   8989525132:AAHGIBxQr0XgUs-kbK0NavE-example
   ```
5. Copiar el token a `.env`:
   ```
   TELEGRAM_BOT_TOKEN=8989525132:AAHGIBxQr0XgUs-kbK0NavE-example
   ```
6. Reiniciar JARVIS

### Formato del identificador de operador (Telegram)

El identificador es el **ID numérico** de la cuenta de Telegram, no el @username:

```
123456789    ← ID numérico
```

Para obtenerlo:
- Hablar con [@userinfobot](https://t.me/userinfobot) — responde con el ID
- O enviar cualquier mensaje al bot de JARVIS — el ID aparece en los logs:
  ```
  [Telegram] Mensaje de: 123456789 → "hola"
  ```

### Configuración del bot en BotFather (opcional)

Para mejor experiencia, configurar el bot desde BotFather:

```
/setdescription  → descripción del bot
/setabouttext    → texto "Acerca de"
/setuserpic      → foto de perfil

# Comandos sugeridos:
/setcommands
help - Mostrar ayuda
pwd - Directorio actual
reset - Reiniciar shell
status - Sesiones activas
```

### Diferencias entre WhatsApp y Telegram

| Aspecto | WhatsApp | Telegram |
|---|---|---|
| Autenticación | QR o código numérico | Token de bot |
| Identificador de operador | `521234567890@s.whatsapp.net` | ID numérico |
| Formato de mensajes | Texto plano + `` `code` `` | Markdown completo |
| Grupos | No soportado actualmente | No soportado actualmente |
| Archivos adjuntos | No soportado actualmente | No soportado actualmente |
| Reconexión | Automática (5s) | Automática (polling continuo) |

### Menú de comandos en Telegram (autocomplete)

Al conectarse, JARVIS registra automáticamente los siguientes comandos en el bot de Telegram. Esto activa el menú de autocompletado cuando el usuario escribe `/`:

| Comando | Descripción en el menú |
|---|---|
| `/help` | Mostrar ayuda completa |
| `/pwd` | Ver directorio actual |
| `/reset` | Reiniciar shell desde el directorio inicial |
| `/status` | Ver sesiones de shell activas |
| `/cd` | Cambiar directorio · ej: /cd source\proyecto |
| `/dir` | Listar archivos del directorio actual |
| `/ls` | Listar archivos (alias de dir) |
| `/git` | Ejecutar git · ej: /git status |
| `/npm` | Ejecutar npm · ej: /npm run dev |
| `/gemini` | Lanzar Gemini CLI |
| `/claude` | Lanzar Claude CLI |

Los comandos que no son built-ins de JARVIS (`/cd`, `/dir`, `/git`, etc.) se normalizan automáticamente: se quita el `/` y se ejecutan en el shell.

### Verificar que el bot Telegram está activo

En el dashboard → Bots, la tarjeta de Telegram muestra:
- `● Conectado` — polling activo
- `○ Desconectado` — token inválido o error de red

También se puede verificar enviando `/help` al bot desde Telegram.
