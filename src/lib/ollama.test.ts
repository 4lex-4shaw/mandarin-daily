import { describe, expect, it } from 'vitest';
import { chooseReply, failureMessage, readChatStream } from './ollama';

describe('Ollama errors', () => {
  const base = { url: 'http://localhost:11434', origin: 'https://4lex-4shaw.github.io', model: 'qwen3-abliterated' };

  it('does not blame CORS for a timeout or a reachable server', () => {
    expect(failureMessage({ ...base, kind: 'timeout' })).not.toMatch(/OLLAMA_ORIGINS/);
    expect(failureMessage({ ...base, kind: 'timeout' })).toMatch(/5 minutes/);
    expect(failureMessage({ ...base, kind: 'network' })).not.toMatch(/OLLAMA_ORIGINS/);
    expect(failureMessage({ ...base, kind: 'abort' })).toBe('Cancelled.');
  });

  it('mentions OLLAMA_ORIGINS only when the server cannot be reached', () => {
    const message = failureMessage({ ...base, kind: 'unreachable' });
    expect(message).toMatch(/OLLAMA_ORIGINS/);
    expect(message).toContain(base.origin);
  });

  it('suggests installed models when the chosen model is missing', () => {
    const message = failureMessage({
      ...base,
      kind: 'http',
      status: 404,
      detail: 'model "qwen3-abliterated" not found',
      models: ['qwen2.5:7b', 'llama3.2'],
    });
    expect(message).toContain('qwen2.5:7b');
    expect(message).not.toMatch(/OLLAMA_ORIGINS/);
  });
});

describe('thinking fallback', () => {
  it('uses message.thinking when content is empty and strips think tags', () => {
    const thinking = '<think>draft</think>ZH: 你好，我叫Alex。\nPY: nǐ hǎo\nEN: Hi, I am Alex.\nNOTE: none';
    expect(chooseReply('', thinking)).toBe('ZH: 你好，我叫Alex。\nPY: nǐ hǎo\nEN: Hi, I am Alex.\nNOTE: none');
    expect(chooseReply('ZH: real', thinking)).toBe('ZH: real');
  });

  it('accumulates thinking chunks when no content arrives', async () => {
    const encoder = new TextEncoder();
    const pieces = [
      '{"message":{"content":"","thinking":"ZH: 你"}}\n',
      '{"message":{"thinking":"好"},"done":true,"done_reason":"stop"}\n',
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) controller.enqueue(encoder.encode(piece));
        controller.close();
      },
    });
    const seen: string[] = [];
    const full = await readChatStream(body, (text) => seen.push(text));
    expect(full.reply).toBe('ZH: 你好');
    expect(full.content).toBe('');
    expect(full.thinking).toBe('ZH: 你好');
    expect(seen).toEqual(['ZH: 你', 'ZH: 你好']);
  });
});

describe('chat stream', () => {
  it('joins content split across chunks', async () => {
    const encoder = new TextEncoder();
    const pieces = [
      '{"message":{"content":"ZH: 你"}}\n{"message":{"content":"好"}}\n',
      '{"message":{"content":"！"},"done":true}',
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) controller.enqueue(encoder.encode(piece));
        controller.close();
      },
    });
    const seen: string[] = [];
    const full = await readChatStream(body, (text) => seen.push(text));
    expect(full.reply).toBe('ZH: 你好！');
    expect(seen).toEqual(['ZH: 你', 'ZH: 你好', 'ZH: 你好！']);
  });
});
