# Comandos de Shell

## Cómo funciona el shell

Cada operador tiene una **sesión de PowerShell persistente** (proceso `powershell.exe` con un wrapper script). La sesión se crea en el primer mensaje del operador y permanece viva indefinidamente. Esto significa:

- `cd source\mi-proyecto` → cambia el directorio
- El siguiente `git status` se ejecuta en `C:\...\mi-proyecto`
- Si la sesión muere (error, reinicio del servidor), se crea una nueva automáticamente

### Por qué PowerShell y no cmd.exe

`cmd.exe` en modo stdin piped (sin TTY real) hace echo de todos los comandos al stdout aunque se use `@echo off`, y la expansión de variables `!errorlevel!` no funciona de forma confiable. PowerShell en modo `-NonInteractive -File` no tiene estos problemas.

Internamente, los comandos se enrutan a través de `cmd /c` para compatibilidad con la sintaxis de Windows:

```
WhatsApp: "dir /b"
    │
    ▼
ShellSession.execute("dir /b")
    │
    ▼
PowerShell wrapper
    │
    ├── ¿Es cd/chdir? → Set-Location (actualiza CWD de PS)
    └── Todo lo demás → cmd.exe /c "chcp 65001 > nul & dir /b"
    │
    ▼
output: listado de archivos
exit code: 0
cwd: C:\directorio\actual
```

## Comandos especiales de JARVIS

Estos comandos son interceptados por JARVIS antes de llegar al shell:

| Comando | Descripción |
|---|---|
| `/help` · `?` · `help` | Muestra la ayuda (adaptada a la plataforma) |
| `/pwd` · `/cwd` | Muestra el directorio actual del shell |
| `/reset` | Mata la sesión y crea una nueva desde `DEFAULT_CWD` |
| `/status` | Lista todas las sesiones activas con sus CWD |
| `!<comando>` | Entra en modo interactivo con el comando dado |
| `!exit` · `/exit` | Sale del modo interactivo |

## Comandos con prefijo `/` o `\` (compatibilidad Telegram)

En Telegram, el menú de comandos del bot muestra opciones con `/`. JARVIS detecta automáticamente cuando un comando que empieza con `/` o `\` **no es un comando especial** y le quita el prefijo antes de enviarlo al shell:

| Lo que escribes | Lo que ejecuta el shell |
|---|---|
| `/cd source\proyecto` | `cd source\proyecto` ✓ |
| `/git status` | `git status` ✓ |
| `/dir /b` | `dir /b` ✓ |
| `/npm install` | `npm install` ✓ |
| `\cd ..` | `cd ..` ✓ |
| `/help` | ayuda JARVIS (no llega al shell) |
| `/pwd` | directorio actual (no llega al shell) |

Esta normalización también funciona en WhatsApp para comandos con `\` al inicio.

## Comandos de terminal normales

Cualquier texto que no empiece con `/` o `!` se ejecuta en el shell:

```
cd source\mi-proyecto     → cambia directorio
dir /b                    → lista archivos (bare)
dir /b /a-d               → solo archivos (sin carpetas)
mkdir nueva-carpeta       → crea directorio
rmdir carpeta /s /q       → elimina directorio recursivo
type archivo.txt          → muestra contenido de archivo
git status                → git (cualquier comando)
git log --oneline -5      → historial compacto
npm install               → herramientas Node
python script.py          → Python
gemini "resume este código"  → Gemini CLI
claude "explica este error"  → Claude CLI
gh copilot suggest "..."     → GitHub Copilot
```

### Formato de respuesta

```
✅ `git status`              ← ícono + comando (✅ ok / ❌ error)
📂 `C:\Users\USER\source`   ← directorio al momento de ejecutar
```
On branch main              ← output del comando
nothing to commit
```
⏱ 342ms · exit 0           ← tiempo de ejecución y exit code
```

Si el output supera 3800 caracteres se trunca con `…[N chars truncados]`.

## Modo interactivo

Para herramientas que requieren una sesión interactiva (REPLs, asistentes CLI), usar el prefijo `!`:

```
!node           → abre Node.js REPL
!python         → abre Python interactivo
!gemini         → lanza Gemini en modo chat
!claude         → lanza Claude en modo chat
```

Una vez en modo interactivo:

1. Los mensajes siguientes se envían directamente al proceso como stdin
2. El output del proceso llega de vuelta en tiempo real (debounced cada 800ms)
3. Para salir: enviar `!exit`, `/exit`, o `exit`

**Ejemplo de sesión con node:**
```
Tú:     !node
JARVIS: 🔀 Modo interactivo: `node`
        Tus próximos mensajes van directo al proceso.
        Escribe `!exit` o `/exit` para terminar.

Tú:     const x = [1,2,3].map(n => n * 2)
JARVIS: ``` undefined ```

Tú:     console.log(x)
JARVIS: ``` [ 2, 4, 6 ] undefined ```

Tú:     !exit
JARVIS: 🔙 Saliste del modo interactivo. Shell normal restaurado.
```

## Comportamiento del CWD (directorio de trabajo)

El directorio persiste entre comandos **de la misma sesión**:

```
Tú:     cd C:\Users\USER\source\mi-proyecto
JARVIS: ✅ `cd C:\Users\USER\source\mi-proyecto`
        📂 `C:\Users\USER\source\mi-proyecto`
        _(sin output)_

Tú:     git status
JARVIS: ✅ `git status`
        📂 `C:\Users\USER\source\mi-proyecto`    ← mismo directorio
        ```
        On branch feature/nueva
        ...
        ```
```

### Limitación: cd en comandos compuestos

`&&` en cmd.exe sí encadena comandos, pero el `cd` dentro del compuesto **no actualiza el CWD de la sesión persistente**:

```
# Esto elimina la carpeta pero NO cambia el directorio persistente:
rmdir mi-carpeta && cd ..

# Hacer esto en su lugar (dos mensajes):
rmdir mi-carpeta
cd ..
```

## Rate limiting

Por defecto, máximo **10 comandos por minuto** por operador. Al superar el límite:
```
⏳ Demasiados comandos. Espera un momento.
```

El contador se resetea cada 60 segundos. El límite es configurable con `RATE_LIMIT_PER_MINUTE` en `.env`.

## Timeout de comandos

Los comandos con timeout (por defecto 60 segundos) devuelven el output acumulado hasta ese momento:

```
✅ `npm install`
📂 `C:\Users\USER\source\mi-proyecto`
```
[output hasta el timeout]
⏱ [Timeout — proceso puede seguir corriendo]
```
⏱ 60000ms · exit 124
```

El proceso del comando puede seguir ejecutándose en background dentro del shell. Para verificar su estado o matarlo, usar `/reset` para reiniciar la sesión completa.

## Reiniciar la sesión

```
/reset
```

Mata el proceso PowerShell del operador y crea uno nuevo desde `DEFAULT_CWD`. Útil cuando:
- Un comando cuelga el shell
- Se quiere volver al directorio inicial
- Se corrompió algún estado de variables de entorno en el shell
