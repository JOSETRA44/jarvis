import type { ITextToSpeechPort } from '../../domain/poltergeist/ports/ITextToSpeechPort.js';
import type { VoiceProfile } from '../../domain/poltergeist/VoiceProfile.js';

export interface VoicesResult {
  readonly voices: VoiceProfile[];
  readonly presets: string[];
}

export class GetVoicesUseCase {
  constructor(private readonly tts: ITextToSpeechPort) {}

  async execute(): Promise<VoicesResult> {
    const voices = await this.tts.listVoices();
    return { voices, presets: this.tts.listPresets() };
  }
}
