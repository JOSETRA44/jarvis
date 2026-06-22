import { keyboard, Key, mouse, Button, Point, screen } from '@nut-tree-fork/nut-js';
import { spawn } from 'child_process';
import type { IGuiAutomationPort } from '../../domain/poltergeist/ports/IGuiAutomationPort.js';
import type { ITextToSpeechPort } from '../../domain/poltergeist/ports/ITextToSpeechPort.js';
import type { ActionResult } from '../../domain/poltergeist/ActionResult.js';

// Silence nut-js verbose logging
keyboard.config.autoDelayMs = 0;
mouse.config.autoDelayMs = 0;
mouse.config.mouseSpeed = 3000;

export interface GuiAdapterOptions {
  screenshotMaxWidth?: number;
  jpegQuality?: number;
}

export class GuiAutomationAdapter implements IGuiAutomationPort {
  private _busy = false;
  private _screenW = 0;
  private _screenH = 0;
  private readonly _maxWidth: number;
  private readonly _quality: number;

  constructor(
    private readonly tts: ITextToSpeechPort,
    opts: GuiAdapterOptions = {},
  ) {
    this._maxWidth = opts.screenshotMaxWidth ?? 1366;
    this._quality = opts.jpegQuality ?? 80;
  }

  async execute(actionId: string, params?: Record<string, string>): Promise<ActionResult> {
    const p = params ?? {};
    // Interactive actions (mouse/keyboard) are near-instant and safe to run
    // concurrently — they bypass the busy lock so rapid taps in sniper mode
    // are never rejected. Only heavy actions (apps/screenshot/tts) are gated.
    if (this._isLight(actionId)) {
      try {
        return await this._dispatch(actionId, p);
      } catch (e) {
        return { success: false, output: `Error: ${String(e)}` };
      }
    }

    if (this._busy) {
      return { success: false, output: 'Acción en progreso, espera un momento' };
    }
    this._busy = true;
    try {
      return await this._dispatch(actionId, p);
    } catch (e) {
      return { success: false, output: `Error: ${String(e)}` };
    } finally {
      this._busy = false;
    }
  }

  private _isLight(id: string): boolean {
    return id.startsWith('mouse_') || id.startsWith('kb_');
  }

  private async _dispatch(id: string, p: Record<string, string>): Promise<ActionResult> {
    switch (id) {
      // ── Apps ────────────────────────────────────────────────────────────
      case 'open_chrome':    return this._openApp('chrome');
      case 'open_notepad':   return this._spawnExe('notepad.exe');
      case 'open_explorer':  return this._spawnExe('explorer.exe');
      case 'open_youtube':   return this._openUrl('https://www.youtube.com');
      case 'open_spotify':   return this._openApp('spotify');
      case 'open_vscode':    return this._openApp('code');
      case 'open_terminal':  return this._openApp('wt');

      // ── Media ────────────────────────────────────────────────────────────
      case 'media_vol_up':   return this._key(Key.AudioVolUp);
      case 'media_vol_down': return this._key(Key.AudioVolDown);
      case 'media_mute':     return this._key(Key.AudioMute);
      case 'media_play':     return this._key(Key.AudioPlay);
      case 'media_next':     return this._key(Key.AudioNext);
      case 'media_prev':     return this._key(Key.AudioPrev);

      // ── Sistema ──────────────────────────────────────────────────────────
      case 'sys_screenshot': return this._screenshot();
      case 'sys_lock':       return this._runPs('rundll32.exe user32.dll,LockWorkStation');
      case 'sys_desktop':    return this._runPs('(New-Object -ComObject Shell.Application).ToggleDesktop()');
      case 'sys_sleep':      return this._runPs(
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState("Suspend",$false,$false)'
      );

      // ── TTS ──────────────────────────────────────────────────────────────
      case 'tts_speak': {
        const text = this._sanitize(p.text ?? '', 200);
        if (!text) return { success: false, output: 'Texto vacío o inválido' };
        const rate = p.rate !== undefined ? Number(p.rate) : undefined;
        return this.tts.speak(text, {
          preset: p.preset,
          voice: p.voice,
          rate: Number.isFinite(rate) ? rate : undefined,
        });
      }

      // ── Teclado ──────────────────────────────────────────────────────────
      case 'kb_win_d':  return this._chord([Key.LeftMeta, Key.D]);
      case 'kb_alt_f4': return this._chord([Key.LeftAlt, Key.F4]);
      case 'kb_ctrl_z': return this._chord([Key.LeftControl, Key.Z]);
      case 'kb_enter':  return this._key(Key.Enter);
      case 'type_text': {
        const text = this._sanitize(p.text ?? '', 500);
        if (!text) return { success: false, output: 'Texto vacío' };
        await keyboard.type(text);
        return { success: true, output: 'Texto enviado' };
      }

      // ── Mouse (sniper mode) ───────────────────────────────────────────────
      case 'mouse_click':  return this._mouseClick(p, 'left');
      case 'mouse_double': return this._mouseClick(p, 'double');
      case 'mouse_right':  return this._mouseClick(p, 'right');
      case 'mouse_drag':   return this._mouseDrag(p);
      case 'mouse_scroll': return this._mouseScroll(p);

      default:
        return { success: false, output: `actionId no reconocido: ${id}` };
    }
  }

  private async _key(k: Key): Promise<ActionResult> {
    await keyboard.pressKey(k);
    await keyboard.releaseKey(k);
    return { success: true, output: 'OK' };
  }

  private async _chord(keys: Key[]): Promise<ActionResult> {
    await keyboard.pressKey(...keys);
    await keyboard.releaseKey(...keys);
    return { success: true, output: 'OK' };
  }

  // ── Mouse helpers ──────────────────────────────────────────────────────────

  private async _ensureScreenSize(): Promise<void> {
    if (this._screenW === 0 || this._screenH === 0) {
      this._screenW = await screen.width();
      this._screenH = await screen.height();
    }
  }

  private _clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.min(1, Math.max(0, v));
  }

  private async _toAbs(xPct: number, yPct: number): Promise<Point> {
    await this._ensureScreenSize();
    const x = Math.round(this._clamp01(xPct) * (this._screenW - 1));
    const y = Math.round(this._clamp01(yPct) * (this._screenH - 1));
    return new Point(x, y);
  }

  private async _mouseClick(
    p: Record<string, string>,
    kind: 'left' | 'double' | 'right',
  ): Promise<ActionResult> {
    const point = await this._toAbs(Number(p.x), Number(p.y));
    await mouse.setPosition(point);
    if (kind === 'left') await mouse.leftClick();
    else if (kind === 'double') await mouse.doubleClick(Button.LEFT);
    else await mouse.rightClick();
    return { success: true, output: `${kind} @ ${point.x},${point.y}` };
  }

  private async _mouseDrag(p: Record<string, string>): Promise<ActionResult> {
    const start = await this._toAbs(Number(p.x), Number(p.y));
    const end = await this._toAbs(Number(p.x2), Number(p.y2));
    await mouse.setPosition(start);
    await mouse.drag([start, end]);
    return { success: true, output: `drag ${start.x},${start.y} → ${end.x},${end.y}` };
  }

  private async _mouseScroll(p: Record<string, string>): Promise<ActionResult> {
    const point = await this._toAbs(Number(p.x), Number(p.y));
    await mouse.setPosition(point);
    const dy = Number(p.dy);
    const amount = Math.min(2000, Math.abs(Number.isFinite(dy) ? dy : 0));
    if (dy < 0) await mouse.scrollUp(amount);
    else await mouse.scrollDown(amount);
    return { success: true, output: `scroll ${dy}` };
  }

  // ── Screenshot ───────────────────────────────────────────────────────────

  private async _screenshot(): Promise<ActionResult> {
    try {
      const img = await screen.grab();
      const { imageToJimp } = await import('@nut-tree-fork/nut-js');
      const jimpImage = await imageToJimp(img);
      // Downscale (keeps aspect) and re-encode as JPEG to shrink the payload
      // from megabytes (PNG) to a few hundred KB — the main anti-jank fix.
      jimpImage.scaleToFit(this._maxWidth, this._maxWidth);
      jimpImage.quality(this._quality);
      const buffer = await jimpImage.getBufferAsync('image/jpeg');
      // output carries the ORIGINAL screen dimensions for the client aspect ratio.
      return {
        success: true,
        output: `${img.width}x${img.height}`,
        data: buffer.toString('base64'),
      };
    } catch (e) {
      return { success: false, output: `Screenshot error: ${String(e)}` };
    }
  }

  // ── Process launchers ──────────────────────────────────────────────────────

  private _openUrl(url: string): Promise<ActionResult> {
    return this._runPs(`Start-Process '${url}'`);
  }

  private _openApp(name: string): Promise<ActionResult> {
    return this._runPs(`Start-Process '${name}'`);
  }

  private _spawnExe(exe: string): Promise<ActionResult> {
    return new Promise((resolve) => {
      const proc = spawn(exe, [], { detached: true, stdio: 'ignore', shell: false });
      proc.unref();
      proc.once('error', (e) => resolve({ success: false, output: e.message }));
      proc.once('spawn', () => resolve({ success: true, output: 'Iniciado' }));
    });
  }

  private _runPs(script: string): Promise<ActionResult> {
    return new Promise((resolve) => {
      const ps = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { stdio: ['ignore', 'ignore', 'pipe'] }
      );
      const errLines: string[] = [];
      ps.stderr?.on('data', (d: Buffer) => errLines.push(d.toString()));
      ps.on('close', (code) => {
        resolve(
          code === 0
            ? { success: true, output: 'OK' }
            : { success: false, output: errLines.join('').trim() || 'Error desconocido' }
        );
      });
      ps.on('error', (e) => resolve({ success: false, output: e.message }));
    });
  }

  private _sanitize(text: string, max: number): string {
    return text
      .replace(/[<>&"'`$\\;|\r\n]/g, '')
      .slice(0, max)
      .trim();
  }
}
