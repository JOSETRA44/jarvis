# ShellSession — Internals

Este documento describe el funcionamiento interno de `ShellSession.ts` para quienes quieran entender, depurar o extender el motor de ejecución.

## Por qué este diseño

El objetivo es una sesión de shell **estadual** (el CWD persiste entre comandos) con **output limpio** (sin echo de comandos ni prompts en el output visible al usuario).

### Problema con cmd.exe en modo piped

Cuando se conecta a `cmd.exe` vía stdin piped (sin TTY real):

1. **Echo de comandos**: aunque se use `@echo off`, cmd.exe en modo piped hace echo de todos los comandos al stdout
2. **Delayed expansion rota**: `!errorlevel!` con `/v:on` no funciona de forma confiable en modo interactivo piped
3. **Prompts en stdout**: `C:\Users\USER>` aparece en el output

### Por qué PowerShell en modo -NonInteractive -File

PowerShell ejecutando un script de archivo (`-File wrapper.ps1`) con `-NonInteractive`:

- **Sin echo de comandos**: el script controla exactamente qué se escribe a stdout
- **Sin prompts**: modo no-interactivo
- **Variables de shell funcionales**: `$LASTEXITCODE`, `$?`, `Get-Location` funcionan correctamente
- **Compatible con cmd**: se puede invocar `cmd.exe /c <comando>` para compatibilidad total con la sintaxis Windows

## El wrapper script

Al crear una `ShellSession`, se escribe el siguiente script en un archivo temporal `%TEMP%\jarvis_shell_*.ps1`:

```powershell
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
Write-Output '__JARVIS_SHELL_READY__'

while ($true) {
    $__l = [Console]::ReadLine()
    if ($null -eq $__l) { break }
    
    # cd/chdir → Set-Location (mantiene el CWD de la sesión PS)
    if ($__l -match '^\s*(?:cd|chdir)\s+(.+)$') {
        $__p = $matches[1].Trim().Trim('"').Trim("'")
        try { Set-Location $__p } catch { Write-Output "cd: $($_.Exception.Message)" }
        $__e = if ($?) { 0 } else { 1 }
    } elseif ($__l -match '^\s*(?:cd|chdir)\s*$') {
        Set-Location $HOME
        $__e = 0
    } else {
        # Todo lo demás: cmd /c para compatibilidad Windows plena
        cmd.exe /c "chcp 65001 > nul 2>&1 & $__l" 2>&1 | ForEach-Object { Write-Output "$_" }
        $__e = $LASTEXITCODE
    }
    
    Write-Output '__JARVIS_SHELL_END__'
    Write-Output $__e
    Write-Output (Get-Location).Path
}
```

### Por qué `cmd.exe /c` para la mayoría de comandos

`cmd /c "chcp 65001 > nul 2>&1 & <comando>"` proporciona:

- **Compatibilidad total**: `dir /b`, `type`, `echo texto con espacios`, `mkdir`, `rmdir`, etc.
- **UTF-8**: `chcp 65001` establece la página de código UTF-8 dentro del subproceso cmd
- **Stderr capturado**: el `2>&1` de PowerShell captura tanto stdout como stderr del proceso cmd
- **Exit code correcto**: `$LASTEXITCODE` recibe el exit code del proceso cmd hijo

### Por qué `Set-Location` para `cd`

Si `cd source\proyecto` se ejecutara vía `cmd /c`, cambiaría el directorio dentro del **subproceso cmd** pero no en la **sesión de PowerShell**. La sesión PS continuaría en el directorio anterior.

Al usar `Set-Location` directamente en PS:
- El CWD de la sesión PS cambia permanentemente
- `(Get-Location).Path` devuelve el nuevo directorio
- Los siguientes `cmd /c` heredan el CWD correcto (cmd hereda el CWD del proceso padre)

## Ciclo de vida de una sesión

```
new ShellSession(cwd)
    │
    ├── Escribe wrapper.ps1 en %TEMP%
    ├── spawn('powershell.exe', ['-NonInteractive', '-File', wrapper.ps1], { cwd })
    ├── stdin.write(init de PS — encoding, etc.)
    │
    └── Espera '__JARVIS_SHELL_READY__' en stdout
              │
              └── ready = true → acepta comandos
```

```
shell.execute('git status')
    │
    ├── Verifica: ready=true, pending=null
    ├── rawBuffer = ''
    ├── pending = { resolve, timer(60s), startedAt }
    ├── stdin.write('git status\n')
    │
    ├── [PowerShell wrapper lee la línea]
    ├── [cmd /c "chcp 65001 > nul & git status" 2>&1]
    ├── [stdout recibe el output de git]
    ├── [stdout recibe '__JARVIS_SHELL_END__']
    ├── [stdout recibe '0']  ← exit code
    ├── [stdout recibe 'C:\Users\USER\mi-proyecto']  ← cwd
    │
    ├── handleData acumula en rawBuffer
    ├── Detecta END_MARKER + 2 líneas después → finishPending()
    │
    └── Resolve: { output: 'On branch main\n...', exitCode: 0, cwd: '...', durationMs: 342 }
```

## Detección de fin de comando

El wrapper emite siempre tres líneas tras ejecutar un comando:

```
__JARVIS_SHELL_END__
0
C:\Users\USER\mi-proyecto
```

En Node.js, estas tres líneas pueden llegar en **eventos `data` separados** del stream stdout. La detección espera a tener las tres antes de resolver:

```typescript
if (this.rawBuffer.includes(END_MARKER)) {
  const markerIdx = this.rawBuffer.indexOf(END_MARKER);
  const after = this.rawBuffer.slice(markerIdx + END_MARKER.length);
  const afterLines = after.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (afterLines.length >= 2) {          // exitCode + cwd presentes
    this.finishPending();
  }
}
```

Esto evita el bug de "parsing prematuro" donde el exit code y el cwd aparecen en el buffer del siguiente comando.

## Modo interactivo

Para herramientas como `!node` o `!gemini`:

```typescript
shell.enterInteractive((chunk) => {
  // chunk llega en tiempo real del proceso
  adapter.sendText(userPhone, chunk);
});
shell.sendRaw('node');   // escribe al stdin del wrapper → cmd /c node
```

En modo interactivo:
- `handleData` pasa los chunks directamente al callback, sin acumular en rawBuffer
- `sendRaw(text)` escribe `text\n` al stdin del wrapper
- El wrapper lo lee y ejecuta vía `cmd /c`

**Limitación**: los procesos en modo interactivo son iniciados dentro del `while($true)` del wrapper, lo que significa que el wrapper no puede distinguir entre el output del comando interactivo y el marcador de fin. Por eso, en modo interactivo, el output es raw — no hay parsing de exit code ni CWD hasta que el usuario ejecuta `!exit`.

## Timeout

```typescript
const timer = setTimeout(() => {
  resolve({
    output: rawBuffer + '\n⏱ [Timeout — proceso puede seguir corriendo]',
    exitCode: 124,
    cwd: this._cwd,
    durationMs: timeoutMs,
  });
}, timeoutMs);  // por defecto 60 segundos
```

Al hacer timeout, el pending se resuelve y el timer se cancela. El proceso PowerShell sigue corriendo — el comando en ejecución continúa en background dentro del wrapper.

Esto puede causar que el output del comando llegue al rawBuffer del **siguiente** comando si se envía uno antes de que el proceso anterior termine. Para limpiar el estado, usar `/reset`.

## Streaming de output (onChunk)

El parámetro `onChunk` permite recibir el output en tiempo real mientras el comando ejecuta:

```typescript
shell.execute('npm install', {
  onChunk: (chunk) => broadcastOutput(operatorId, chunk)
});
```

Los chunks se emiten desde `handleData` cada vez que llegan datos al stdout, antes de detectar el END_MARKER. Los chunks que contienen el marcador son filtrados.

## Limpieza

Al llamar `shell.kill()` o cuando el proceso muere:

1. Se elimina el archivo temporal `wrapper.ps1`
2. Se envía `SIGTERM` al proceso PowerShell
3. El `SessionManager` detecta el evento `exit` y elimina la sesión del mapa

```typescript
process.on('SIGINT', () => {
  sessionMgr.killAll();   // mata todos los procesos PowerShell
  process.exit(0);
});
```
