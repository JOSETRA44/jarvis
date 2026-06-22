import type { ActionResult } from '../ActionResult.js';
import type { VoiceProfile } from '../VoiceProfile.js';

export interface SpeakOptions {
  /** Explicit installed voice id (overrides the preset's voice). */
  readonly voice?: string;
  /** Named preset: 'jarvis' | 'default' | ... */
  readonly preset?: string;
  /** Playback rate ratio (1.0 = normal). */
  readonly rate?: number;
}

/**
 * Port for text-to-speech. The local implementation uses the OS speech engine;
 * a future cloud implementation (e.g. ElevenLabs) can be swapped behind this
 * interface without touching the domain or application layers.
 */
export interface ITextToSpeechPort {
  speak(text: string, opts?: SpeakOptions): Promise<ActionResult>;
  listVoices(): Promise<VoiceProfile[]>;
  /** Preset ids this engine supports (e.g. ['jarvis', 'default']). */
  listPresets(): string[];
}
