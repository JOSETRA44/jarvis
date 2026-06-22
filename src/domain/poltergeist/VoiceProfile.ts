/**
 * A TTS voice available on the host, exposed to the client for selection.
 * Value object — immutable, identity by `id`.
 */
export interface VoiceProfile {
  readonly id: string;       // e.g. "Microsoft David Desktop"
  readonly label: string;    // human-friendly name
  readonly culture: string;  // e.g. "en-US"
  readonly gender: string;   // "Male" | "Female" | "Neutral"
}
