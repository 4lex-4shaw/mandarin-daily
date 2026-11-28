import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useApp } from '../state';
import { GlossaryText, PinyinLine } from '../components';
import { buildChatMessages, freshReply, liveTutorText, noteIsEmpty, parseTutor, repliesTooSimilar, tutorSystemPrompt, withRepeatNudge } from '../lib/tutor';
import {
  CHAT_TIMEOUT_MS,
  failureMessage,
  listModels,
  OllamaError,
  streamChat,
  warmModel,
} from '../lib/ollama';
import type { ChatMessage } from '../types';

const LOADING = 'Loading the model on your PC, first reply can take a minute or two…';

export function Chat() {
  const { settings, updateSettings, chat, setChat } = useApp();
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<'idle' | 'warming' | 'waiting' | 'streaming'>('idle');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const inflight = useRef<AbortController | null>(null);
  const origin = typeof window === 'undefined' ? 'https://4lex-4shaw.github.io' : window.location.origin;

  useEffect(() => {
    const ctrl = new AbortController();
    inflight.current = ctrl;
    const timer = window.setTimeout(() => {
      if (!ctrl.signal.aborted) ctrl.abort('timeout');
    }, CHAT_TIMEOUT_MS);
    let ignore = false;
    setPhase('warming');
    setError('');
    void (async () => {
      const names = await listModels(settings.ollamaUrl);
      if (ignore) return;
      setModels(names);
      const result = await warmModel(settings.ollamaUrl, settings.ollamaModel, ctrl.signal);
      if (ignore || result === 'aborted' || result === 'ok') return;
      const message = failureMessage({
        kind: result === 'missing' ? 'http' : result === 'timeout' ? 'timeout' : 'unreachable',
        url: settings.ollamaUrl,
        origin,
        model: settings.ollamaModel,
        status: result === 'missing' ? 404 : undefined,
        models: names,
      });
      setError(message);
    })().finally(() => {
      window.clearTimeout(timer);
      if (!ignore) setPhase((current) => (current === 'warming' ? 'idle' : current));
    });
    return () => {
      ignore = true;
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [settings.ollamaUrl, settings.ollamaModel, origin]);

  function cancel() {
    inflight.current?.abort();
    setPhase('idle');
    setPartial('');
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || phase === 'waiting' || phase === 'streaming') return;
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', text, zh: '', py: '', en: '', note: '', at: Date.now() };
    const history = [...chat, user];
    setChat(history);
    setDraft('');
    setError('');
    setPartial('');
    setPhase('waiting');
    try {
      const thread = buildChatMessages({
        system: tutorSystemPrompt(settings.track, settings.level),
        history,
      });
      const previous = [...history].reverse().find((message) => message.role === 'tutor');
      const ask = (messages: typeof thread, temperature: number) =>
        streamChat({
          url: settings.ollamaUrl,
          model: settings.ollamaModel,
          origin,
          messages,
          temperature,
          signal: ctrl.signal,
          onDelta: (full) => {
            setPhase('streaming');
            setPartial(full);
          },
        });
      const spoken = (value: string) => parseTutor(value).zh || value;
      const previousSpoken = previous ? previous.zh || previous.text : '';
      let result = await ask(thread, 0.7);
      let reply = freshReply(result.content, result.thinking, previousSpoken);
      if (previousSpoken && repliesTooSimilar(spoken(reply), previousSpoken)) {
        setPartial('');
        setPhase('waiting');
        result = await ask(withRepeatNudge(thread), 1);
        reply = freshReply(result.content, result.thinking, previousSpoken);
      }
      const parsed = parseTutor(reply);
      const tutor: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'tutor',
        text: reply,
        zh: parsed.zh,
        py: parsed.py,
        en: parsed.en,
        note: parsed.note,
        at: Date.now(),
      };
      setChat([...history, tutor]);
    } catch (err) {
      if (!(err instanceof OllamaError && err.kind === 'abort')) {
        setError(err instanceof OllamaError ? err.message : 'Ollama could not answer.');
      }
    } finally {
      setPhase('idle');
      setPartial('');
    }
  }

  const loading = phase === 'warming' || phase === 'waiting';
  const busy = phase === 'waiting' || phase === 'streaming';
  const modelOptions = models.includes(settings.ollamaModel) || !settings.ollamaModel ? models : [settings.ollamaModel, ...models];
  const live = liveTutorText(partial);

  return (
    <div className="stack chat">
      <h1>Conversation partner</h1>
      <p className="muted">
        Optional. This talks to Ollama on your computer at {settings.ollamaUrl}. The first reply can take a minute or two while a large model loads. Later turns keep it loaded for 30 minutes.
      </p>
      {modelOptions.length > 0 && (
        <label className="field">
          Model
          <select value={settings.ollamaModel} onChange={(event) => updateSettings({ ollamaModel: event.target.value })}>
            {modelOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      <div className="thread">
        {chat.length === 0 && !live && <p className="muted">Say hi in Chinese or English. Replies show characters first. Tap a message for pinyin and English.</p>}
        {chat.map((message) => (
          <ChatBubble key={message.id} message={message} />
        ))}
        {live && <p className="bubble tutor" lang="zh-CN">{live}</p>}
      </div>
      {loading && (
        <div className="banner" role="status">
          <p>{LOADING}</p>
        </div>
      )}
      {error && (
        <div className="banner" role="alert">
          <p>{error}</p>
        </div>
      )}
      <form className="composer" onSubmit={(event) => void send(event)}>
        <label className="sr-only" htmlFor="chat-input">Message</label>
        <textarea
          id="chat-input"
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="试着用中文说说今天。"
          disabled={busy}
        />
        <p className="muted tiny">Enter adds a line. Ctrl+Enter or ⌘+Enter sends.</p>
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>{busy ? 'Waiting…' : 'Send'}</button>
          {phase !== 'idle' && (
            <button type="button" className="btn" onClick={cancel}>Cancel</button>
          )}
        </div>
      </form>
      {chat.length > 0 && <button type="button" className="btn btn-ghost" onClick={() => setChat([])}>Clear chat</button>}
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(false);
  if (message.role === 'user') {
    return <p className="bubble me">{message.text}</p>;
  }
  return (
    <div className="bubble tutor">
      <GlossaryText text={message.zh || message.text} showPinyin={false} />
      {!noteIsEmpty(message.note) && <p className="note">{message.note}</p>}
      <button type="button" className="btn btn-ghost" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide pinyin and English' : 'Pinyin and English'}
      </button>
      {open && (
        <div className="stack">
          {message.py && <PinyinLine pinyin={message.py} />}
          {message.en && <p>{message.en}</p>}
          {!message.py && !message.en && <p className="muted">The model did not split out pinyin and English.</p>}
        </div>
      )}
    </div>
  );
}
