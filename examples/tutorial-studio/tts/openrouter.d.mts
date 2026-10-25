export declare const SPEECH_URL: string;

export interface SpeechRequest {
  model: string;
  voice: string;
  input: string;
  response_format: 'mp3';
}

export declare function readKey(options?: {
  env?: Record<string, string | undefined>;
  home?: string;
}): string | undefined;

export declare function speechRequest(options: { model: string; voice: string; text: string }): SpeechRequest;

export declare function mp3ToFloat(mp3: Buffer): Promise<Buffer>;

export interface OpenRouterEngine {
  describe(): { engine: 'openrouter'; model: string; voice: string };
  generate(text: string): Promise<Buffer>;
}

export declare function openrouter(options: {
  model: string;
  voice: string;
  key?: string;
  fetchImpl?: typeof fetch;
  toFloat?: (mp3: Buffer) => Promise<Buffer>;
}): OpenRouterEngine;
