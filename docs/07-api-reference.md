# Referencia de API

La API REST corre en `http://localhost:3000/api`. Todos los endpoints excepto `/auth/login` requieren autenticación JWT.

## Autenticación

### `POST /api/auth/login`

Autentica con la contraseña del dashboard y devuelve un token JWT.

**Request:**
```json
{
  "password": "tu_password"
}
```

**Response 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response 401:**
```json
{ "error": "Contraseña incorrecta" }
```

El token dura **24 horas**. Incluirlo en todos los requests posteriores:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Operadores

### `GET /api/operators`

Lista todos los operadores registrados.

**Response 200:**
```json
[
  {
    "id": "uuid-1234",
    "platform": "whatsapp",
    "identifier": "521234567890@s.whatsapp.net",
    "displayName": "Mi teléfono",
    "permissions": ["shell"],
    "enabled": true,
    "createdAt": "2026-06-18T12:00:00.000Z"
  }
]
```

---

### `POST /api/operators`

Registra un nuevo operador.

**Request:**
```json
{
  "platform": "whatsapp",
  "identifier": "521234567890@s.whatsapp.net",
  "displayName": "Mi teléfono",
  "permissions": ["shell"]
}
```

**Plataformas válidas:** `whatsapp` | `telegram`

**Permisos válidos:** `shell` | `ai` | `read-only` _(extensibles)_

**Response 201:**
```json
{
  "id": "uuid-1234",
  "platform": "whatsapp",
  "identifier": "521234567890@s.whatsapp.net",
  "displayName": "Mi teléfono",
  "permissions": ["shell"],
  "enabled": true,
  "createdAt": "2026-06-18T12:00:00.000Z"
}
```

**Response 409** — si el identificador ya existe:
```json
{ "error": "Operator already exists" }
```

---

### `PATCH /api/operators/:id`

Actualiza un operador (habilitado/deshabilitado, permisos, nombre).

**Request (cualquier combinación de campos):**
```json
{
  "enabled": false,
  "permissions": ["shell", "ai"],
  "displayName": "Nuevo nombre"
}
```

**Response 200:** el operador actualizado (mismo formato que POST).

---

### `DELETE /api/operators/:id`

Elimina un operador permanentemente.

**Response 200:**
```json
{ "success": true }
```

---

## Historial de comandos

### `GET /api/commands?limit=50`

Devuelve los comandos ejecutados más recientes.

**Query params:**
| Parámetro | Default | Descripción |
|---|---|---|
| `limit` | `50` | Máximo de comandos a devolver |

**Response 200:**
```json
[
  {
    "id": "uuid",
    "sessionId": "uuid",
    "operatorId": "uuid",
    "input": "git status",
    "output": "On branch main\nnothing to commit",
    "exitCode": 0,
    "durationMs": 342,
    "executedAt": "2026-06-18T15:30:00.000Z"
  }
]
```

---

## Bots

### `GET /api/bots`

Estado actual de todos los bots configurados.

**Response 200:**
```json
[
  {
    "platform": "whatsapp",
    "status": "connected",
    "identifier": "+52 123 456 7890",
    "lastConnectedAt": "2026-06-18T12:00:00.000Z"
  },
  {
    "platform": "telegram",
    "status": "connected",
    "identifier": "@mi_jarvis_bot",
    "lastConnectedAt": "2026-06-18T12:00:00.000Z"
  }
]
```

**Estados posibles:** `connected` | `connecting` | `disconnected`

---

### `GET /api/bots/qr`

Devuelve el QR de WhatsApp actual (si está pendiente de escanear).

**Response 200:**
```json
{
  "dataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

**Response 404** — si no hay QR pendiente (ya conectado o no hay WhatsApp):
```json
{ "error": "No QR available" }
```

---

### `POST /api/bots/:platform/disconnect`

Desconecta un bot. `:platform` = `whatsapp` | `telegram`.

**Response 200:**
```json
{ "success": true }
```

---

## Configuración

### `GET /api/config`

Devuelve la configuración operativa actual.

**Response 200:**
```json
{
  "mode": "full-shell"
}
```

---

### `PUT /api/config`

Actualiza la configuración operativa (sin reiniciar).

**Request:**
```json
{
  "mode": "restricted"
}
```

**Modos válidos:** `ai` | `restricted` | `full-shell`

**Response 200:**
```json
{
  "mode": "restricted"
}
```

---

## WebSocket

### `GET /ws/terminal` (WebSocket upgrade)

Conectar al stream en tiempo real del terminal.

**URL:** `ws://localhost:3000/ws/terminal`

#### Mensajes del servidor → cliente

**Output de comando (streaming):**
```json
{
  "type": "output",
  "operatorId": "uuid-del-operador",
  "chunk": "On branch main\n"
}
```

**QR de WhatsApp:**
```json
{
  "type": "qr",
  "dataUrl": "data:image/png;base64,..."
}
```

**Cambio de estado de bot:**
```json
{
  "type": "bot_status",
  "platform": "whatsapp",
  "status": "connected"
}
```

#### Mensajes del cliente → servidor

**Suscribirse a un operador específico:**
```json
{
  "subscribe": "uuid-del-operador"
}
```

Sin suscripción, el cliente recibe todos los eventos (QR, bot_status) pero no el output de comandos.

---

## Códigos de error comunes

| Código | Significado |
|---|---|
| `400` | Request malformado o validación fallida |
| `401` | Sin token o token inválido/expirado |
| `403` | Sin permisos para este recurso |
| `404` | Recurso no encontrado |
| `409` | Conflicto (ej: operador duplicado) |
| `500` | Error interno del servidor |

---

## Ejemplos con curl

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"mi_password"}' | jq -r '.token')

# 2. Listar operadores
curl http://localhost:3000/api/operators \
  -H "Authorization: Bearer $TOKEN"

# 3. Crear operador WhatsApp
curl -X POST http://localhost:3000/api/operators \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "whatsapp",
    "identifier": "521234567890@s.whatsapp.net",
    "displayName": "Mi número",
    "permissions": ["shell"]
  }'

# 4. Deshabilitar operador
curl -X PATCH http://localhost:3000/api/operators/uuid-1234 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# 5. Ver últimos 10 comandos
curl "http://localhost:3000/api/commands?limit=10" \
  -H "Authorization: Bearer $TOKEN"

# 6. Cambiar modo de operación
curl -X PUT http://localhost:3000/api/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode": "full-shell"}'
```
