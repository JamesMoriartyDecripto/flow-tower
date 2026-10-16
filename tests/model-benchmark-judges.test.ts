import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script with no declaration file
import { sttRoundTrip, visionJudge, wer } from '../examples/model-benchmark/scripts/judge-media.mjs';

// A stub fetch that answers every call with the same JSON body and records the requests it saw.
function stub(body: unknown) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: { get: () => null },
    };
  };
  return { calls, fetchImpl };
}

const chatReply = (text: string, cost = 0.002) => ({ choices: [{ message: { content: text } }], usage: { cost } });

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'bench-judges-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('wer', () => {
  it('is 0 for identical text', () => {
    expect(wer('the cat sat', 'the cat sat')).toBe(0);
  });

  it('counts one inserted word over three reference words', () => {
    expect(wer('the cat sat', 'the cat sat down')).toBeCloseTo(1 / 3);
  });

  it('ignores case and punctuation', () => {
    expect(wer('Hello, world!', 'hello world')).toBe(0);
  });

  it('keeps accents, so "perché" and "perche" are different words', () => {
    expect(wer('perché no', 'perche no')).toBe(0.5);
  });

  it('reads a dotted address the same as the spoken "punto"', () => {
    expect(wer('visitate il sito librivox.org', 'visitate il sito librivox punto org')).toBe(0);
  });

  it('reads a dotted address the same as the spoken "dot"', () => {
    expect(wer('visit librivox.org', 'visit librivox dot org')).toBe(0);
  });

  it('keeps "dot" when no top-level domain follows it', () => {
    expect(wer('the dot matrix', 'the matrix')).toBeCloseTo(1 / 3);
  });

  it('treats "punto it" after a word as the address example.it', () => {
    expect(wer('vai su example punto it', 'vai su example.it')).toBe(0);
  });
});

describe('vision-judge', () => {
  const questions = [{ q: 'Is there a red cube?', a: true }, { q: 'Is there a dog?', a: true }];

  it('sends the image to the judge of the other family', async () => {
    const image = join(dir, 'cube.png');
    writeFileSync(image, Buffer.from([0x89, 0x50]));
    const { calls, fetchImpl } = stub(chatReply('[true,true]'));
    const r = await visionJudge({ key: 'k', fetchImpl }, {
      judges: ['qwen/j2'], candidate: 'google/x', artifact: image, questions,
    });
    expect(r.pass).toBe(true);
    expect(r.judgeModel).toBe('qwen/j2');
    expect(r.judgeCost).toBe(0.002);
    expect(calls).toHaveLength(1);
    const content = (calls[0].body.messages as { content: { type: string; image_url?: { url: string } }[] }[])[0].content;
    expect(content.find((c) => c.type === 'image_url')?.image_url?.url.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('picks qwen/j2 for a google/x candidate when the judges are google/j and qwen/j2', async () => {
    const image = join(dir, 'cube.png');
    writeFileSync(image, Buffer.from([0x89, 0x50]));
    const { calls, fetchImpl } = stub(chatReply('[true,true]'));
    const r = await visionJudge({ key: 'k', fetchImpl }, {
      judges: ['google/j', 'qwen/j2'], candidate: 'google/x', artifact: image, questions,
    });
    expect(r.judgeModel).toBe('qwen/j2');
    expect(calls[0].body.model).toBe('qwen/j2');
  });

  it('fails on the second question when the judge answers [true,false]', async () => {
    const image = join(dir, 'cube.png');
    writeFileSync(image, Buffer.from([0x89, 0x50]));
    const { fetchImpl } = stub(chatReply('[true,false]'));
    const r = await visionJudge({ key: 'k', fetchImpl }, {
      judges: ['qwen/j2'], candidate: 'google/x', artifact: image, questions,
    });
    expect(r.pass).toBe(false);
    expect(r.detail).toContain('question 2');
    expect(r.detail).toContain('Is there a dog?');
  });

  it('is pending when both judges are of the candidate family', async () => {
    const { calls, fetchImpl } = stub(chatReply('[true,true]'));
    const r = await visionJudge({ key: 'k', fetchImpl }, {
      judges: ['google/j', 'google/j2'], candidate: 'google/x', artifact: join(dir, 'x.png'), questions,
    });
    expect(r.pass).toBeNull();
    expect(r.detail).toBe('no judge from another family');
    expect(calls).toHaveLength(0);
  });
});

describe('wer-roundtrip', () => {
  it('passes when the transcription matches the prompt, and sets judgeCost', async () => {
    const artifact = join(dir, 'speech.mp3');
    writeFileSync(artifact, Buffer.from([0xff, 0xfb]));
    const { calls, fetchImpl } = stub({ text: 'Good morning, everyone.', usage: { cost: 0.0004 } });
    const r = await sttRoundTrip({ key: 'k', fetchImpl }, {
      sttModel: 'openai/whisper', artifact, prompt: 'good morning everyone', maxWer: 0.15,
    });
    expect(r.pass).toBe(true);
    expect(r.detail).toBe('wer 0.00');
    expect(r.judgeModel).toBe('openai/whisper');
    expect(r.judgeCost).toBe(0.0004);
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/audio/transcriptions');
  });
});
