import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../state';
import { GlossaryText, HanziBlock, PinyinLine, SpeakButton, otherReadings } from '../components';
import { displayHanzi, inPool, levelBadges, posLabel, searchWords } from '../lib/segment';
import { normalizePinyinInput } from '../lib/pinyin';
import type { Word } from '../types';

export function Dictionary() {
  const { index, settings } = useApp();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Word[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => setHits(query.trim() ? searchWords(query, index) : []), 80);
    return () => window.clearTimeout(timer);
  }, [query, index]);
  const preview = useMemo(
    () =>
      index.words
        .filter((word) => inPool(word, settings.track, settings.level))
        .sort((a, b) => a.q - b.q)
        .slice(0, 12),
    [index, settings.track, settings.level],
  );
  return (
    <div className="stack">
      <h1>Words</h1>
      <label className="field">
        <span className="sr-only">Search</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="汉字, pinyin, or English" />
      </label>
      <ul className="word-list">
        {(query.trim() ? hits : preview).map((word) => (
          <li key={word.id}>
            <Link to={`/words/${encodeURIComponent(word.id)}`}>
              <strong lang="zh-CN">{displayHanzi(word, settings.traditional)}</strong>
              <span className="pinyin" lang="zh-Latn">{word.p}</span>
              <em>{word.m.split(';')[0]}</em>
            </Link>
          </li>
        ))}
      </ul>
      {query.trim() && hits.length === 0 && <p className="muted">No matches. You can add it as a custom word.</p>}
      <CustomWordForm />
    </div>
  );
}

export function WordDetail() {
  const { id = '' } = useParams();
  const wordId = decodeURIComponent(id);
  const { index, cards, addToDeck, removeFromDeck, sentences } = useApp();
  const word = index.byId.get(wordId);
  const navigate = useNavigate();
  if (!word) {
    return (
      <div className="stack">
        <p>That word is not in the dictionary.</p>
        <button type="button" className="btn" onClick={() => navigate('/words')}>Back</button>
      </div>
    );
  }
  const examples = sentences.filter((sentence) => sentence.tiles.includes(word.s)).slice(0, 3);
  const alts = otherReadings(word, index);
  return (
    <div className="stack">
      <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Back</button>
      <HanziBlock word={word} />
      <p>{word.m}</p>
      <p className="muted">{[levelBadges(word), posLabel(word.pos)].filter(Boolean).join(' · ')}</p>
      <div className="row">
        <SpeakButton text={word.s} />
        {cards.has(word.id) ? (
          <button type="button" className="btn" onClick={() => removeFromDeck(word.id)}>Remove from deck</button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => addToDeck(word.id)}>Add to my deck</button>
        )}
      </div>
      {alts.length > 0 && (
        <section className="card">
          <p className="eyebrow">Other readings</p>
          {alts.map((alt) => (
            <p key={alt.id}><PinyinLine pinyin={alt.p} /> — {alt.m.split(';')[0]}</p>
          ))}
        </section>
      )}
      {examples.length > 0 && (
        <section className="stack">
          <p className="eyebrow">Examples</p>
          {examples.map((sentence) => (
            <div key={sentence.id} className="card">
              <GlossaryText text={sentence.zh} />
              <p className="muted">{sentence.en}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function CustomWordForm() {
  const { settings, addCustomWord, addToDeck } = useApp();
  const [s, setS] = useState('');
  const [t, setT] = useState('');
  const [py, setPy] = useState('');
  const [m, setM] = useState('');
  const [message, setMessage] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!/[\u3400-\u9fff]/.test(s)) {
      setMessage('Enter the word in Chinese characters.');
      return;
    }
    const pinyin = normalizePinyinInput(py);
    if (!pinyin) {
      setMessage('Add tones, like nǐ hǎo or ni3 hao3.');
      return;
    }
    if (!m.trim()) {
      setMessage('Add an English meaning.');
      return;
    }
    const level = Math.min(Math.max(settings.level, 1), 6);
    const word: Word = {
      id: `custom~${crypto.randomUUID()}`,
      s: s.trim(),
      t: t.trim() || s.trim(),
      p: pinyin.p,
      n: pinyin.n,
      m: m.trim(),
      h: level,
      b: settings.level >= 7 ? 7 : level,
      q: 40,
      pos: '',
      alt: 0,
    };
    addCustomWord(word);
    addToDeck(word.id);
    setS('');
    setT('');
    setPy('');
    setM('');
    setMessage('Added to your deck.');
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <p className="eyebrow">Custom word</p>
      <label className="field">Simplified<input value={s} onChange={(event) => setS(event.target.value)} /></label>
      <label className="field">Traditional, if different<input value={t} onChange={(event) => setT(event.target.value)} /></label>
      <label className="field">Pinyin<input value={py} onChange={(event) => setPy(event.target.value)} placeholder="nǐ hǎo" autoCapitalize="none" /></label>
      <label className="field">Meaning<input value={m} onChange={(event) => setM(event.target.value)} /></label>
      {message && <p role="status">{message}</p>}
      <button type="submit" className="btn">Add to my deck</button>
    </form>
  );
}
