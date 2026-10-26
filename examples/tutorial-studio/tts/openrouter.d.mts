export declare const SPEECH_URL: string;

export type SpeechFormat = 'mp3' | 'pcm';

export interface SpeechRequest {
  model: string;
  voice: string;
  input: string;
  response_format: SpeechFormat;
}

export declare function readKey(options?: {
  env?: Record<string, string | undefined>;
  home?: string;
}): string | undefined;

export declare function speechRequest(options: {
  model: string;
  voice: string;
  text: string;
  format?: SpeechFormat;
}): SpeechRequest;

export declare function pcmFormat(contentType: string): { rate: number; channels: number };

export type ConvertInput =
  | { format: 'mp3' }
  | { format: 'pcm'; rate: number; channels: number };

export declare function toFloat(audio: Buffer, input?: ConvertInput): Promise<Buffer>;

export interface OpenRouterEngine {
  describe(): { engine: 'openrouter'; model: string; voice: string; format: SpeechFormat };
  generate(text: string): Promise<Buffer>;
}

export declare function openrouter(options: {
  model: string;
  voice: string;
  format?: SpeechFormat;
  key?: string;
  fetchImpl?: typeof fetch;
  toFloat?: (audio: Buffer, input: ConvertInput) => Promise<Buffer>;
}): OpenRouterEngine;
