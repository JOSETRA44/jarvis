import { spawn } from 'child_process';
import type { ITextToSpeechPort, SpeakOptions } from '../../domain/poltergeist/ports/ITextToSpeechPort.js';
import type { ActionResult } from '../../domain/poltergeist/ActionResult.js';
import type { VoiceProfile } from '../../domain/poltergeist/VoiceProfile.js';

interface Preset {
  readonly voice?: string;   // installed voice name; undefined → OS default
  readonly culture: string;  // xml:lang for the SSML document
  readonly pitch?: string;   // SSML prosody pitch, e.g. "-3st"; undefined → no SSML
  readonly rateInt: number;  // System.Speech Rate (-10..10)
}

/**
 * Local text-to-speech using Windows System.Speech via PowerShell.
 *
 * The "jarvis" preset lowers pitch (SSML <prosody>) and slows the rate to
 * approximate a deep, measured butler voice — the closest local approximation
 * to JARVIS, since no British male voice is installed and System.Speech is the
 * only offline engine available. A future ElevenLabsTtsAdapter can implement
 * the same ITextToSpeechPort for an authentic voice.
 *
 * Text is XML-escaped and piped via stdin (never interpolated into the command)
 * to prevent injection.
 */
export class LocalTtsAdapter implements ITextToSpeechPort {
  private static readonly PRESETS: Record<string, Preset> = {
    jarvis:  { voice: 'Microsoft David Desktop', culture: 'en-US', pitch: '-3st', rateInt: -1 },
    default: { culture: 'en-US', rateInt: 0 },
  };

  listPresets(): string[] {
    return Object.keys(LocalTtsAdapter.PRESETS);
  }

  speak(text: string, opts: SpeakOptions = {}): Promise<ActionResult> {
    const preset =
      LocalTtsAdapter.PRESETS[opts.preset ?? 'default'] ??
      LocalTtsAdapter.PRESETS.default;

    const voice = opts.voice ?? preset.voice;
    const rateInt =
      opts.rate !== undefined && Number.isFinite(opts.rate)
        ? this._ratioToRateInt(opts.rate)
        : preset.rateInt;
    const usePitch = !opts.voice && !!preset.pitch; // pitch only for unmodified preset voice

    let psCommand = '[Console]::InputEncoding=[System.Text.Encoding]::UTF8;';
    psCommand += 'Add-Type -AssemblyName System.Speech;';
    psCommand += '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;';
    if (voice) psCommand += `try { $s.SelectVoice('${this._psQuote(voice)}') } catch {};`;
    psCommand += `$s.Rate = ${Math.round(rateInt)};`;
    psCommand += usePitch
      ? '$s.SpeakSsml([Console]::In.ReadToEnd());'
      : '$s.Speak([Console]::In.ReadToEnd());';

    const piped = usePitch
      ? `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${preset.culture}"><prosody pitch="${preset.pitch}">${this._xmlEscape(text)}</prosody></speak>`
      : text;

    return this._runPsWithInput(psCommand, piped, 'Dicho');
  }

  async listVoices(): Promise<VoiceProfile[]> {
    const psCommand =
      'Add-Type -AssemblyName System.Speech;' +
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;' +
      '$s.GetInstalledVoices() | % { "$($_.VoiceInfo.Name)|$($_.VoiceInfo.Culture)|$($_.VoiceInfo.Gender)" }';
    const out = await this._runPsCapture(psCommand);
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, culture, gender] = line.split('|');
        return {
          id: name,
          label: name.replace(/^Microsoft\s+/, '').replace(/\s+Desktop$/, ''),
          culture: culture ?? '',
          gender: gender ?? '',
        } as VoiceProfile;
      });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Map a playback ratio (1.0 normal) to System.Speech Rate (-10..10). */
  private _ratioToRateInt(ratio: number): number {
    return Math.max(-10, Math.min(10, Math.round((ratio - 1) * 10)));
  }

  private _psQuote(s: string): string {
    return s.replace(/'/g, "''");
  }

  private _xmlEscape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private _runPsWithInput(script: string, input: string, okMsg: string): Promise<ActionResult> {
    return new Promise((resolve) => {
      const ps = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { stdio: ['pipe', 'ignore', 'pipe'] }
      );
      const errLines: string[] = [];
      ps.stderr?.on('data', (d: Buffer) => errLines.push(d.toString()));
      ps.on('close', (code) => {
        resolve(
          code === 0
            ? { success: true, output: okMsg }
            : { success: false, output: errLines.join('').trim() || 'Error TTS' }
        );
      });
      ps.on('error', (e) => resolve({ success: false, output: e.message }));
      ps.stdin?.end(Buffer.from(input, 'utf8'));
    });
  }

  private _runPsCapture(script: string): Promise<string> {
    return new Promise((resolve) => {
      const ps = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const out: string[] = [];
      ps.stdout?.on('data', (d: Buffer) => out.push(d.toString()));
      ps.on('close', () => resolve(out.join('')));
      ps.on('error', () => resolve(''));
    });
  }
}
