import { useMemo, useState } from 'react';
import { Volume2 } from 'lucide-react';
import type { Word } from './types';
import { useApp } from './state';
import { annotate, type RubyToken } from './lib/ruby';
import { displayHanzi, levelBadges, posLabel, type LexiconIndex } from './lib/segment';
import { speak } from './lib/speech';
import { splitPinyin, toneClass } from './lib/pinyin';

export function SpeakButton({ text, label = 'Play pronunciation' }: { text: string; label?: string }) {
  const { settings } = useApp();
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={label}
      onClick={() => speak(text, { voiceURI: settings.voiceURI, traditional: settings.traditional })}
    >
      <Volume2 aria-hidden="true" size={20} />
    </button>
  );
}

export function PinyinLine({ pinyin }: { pinyin: string }) {
  const { settings } = useApp();
  const parts = splitPinyin(pinyin);
  return (
    <span className="pinyin pinyin-line" lang="zh-Latn">
      {parts.map((part, i) => (
        <span key={`${part.text}-${i}`} className={toneClass(part.tone, settings.toneColors)}>
          {part.text}
        </span>
      ))}
    </span>
  );
}

export function HanziBlock({ word, size = 'xl' }: { word: Word; size?: 'xl' | 'lg' }) {
  const { settings } = useApp();
  return (
    <div className={`hanzi-block ${size}`}>
      <div className="hanzi" lang={settings.traditional ? 'zh-TW' : 'zh-CN'}>
        {displayHanzi(word, settings.traditional)}
      </div>
      {settings.showPinyin && <PinyinLine pinyin={word.p} />}
    </div>
  );
}

export function GlossaryText({ text, showPinyin }: { text: string; showPinyin?: boolean }) {
  const { settings, index, addToDeck, cards } = useApp();
  const tokens = useMemo(() => annotate(text, index), [text, index]);
  const [open, setOpen] = useState<number | null>(null);
  const pinyinOn = showPinyin ?? settings.showPinyin;
  const active = open == null ? null : tokens[open];
  return (
    <div className="glossary">
      <RubyRow tokens={tokens} pinyinOn={pinyinOn} toneColors={settings.toneColors} traditional={settings.traditional} onOpen={setOpen} />
      {active?.word && (
        <div className="sheet-back" role="presentation" onClick={() => setOpen(null)}>
          <div className="sheet" role="dialog" aria-label="Word" onClick={(event) => event.stopPropagation()}>
            <div className="hanzi lg" lang={settings.traditional ? 'zh-TW' : 'zh-CN'}>
              {displayHanzi(active.word, settings.traditional)}
            </div>
            <PinyinLine pinyin={active.word.p} />
            <p>{active.word.m}</p>
            <p className="muted">{[levelBadges(active.word), posLabel(active.word.pos)].filter(Boolean).join(' · ')}</p>
            <div className="row">
              <SpeakButton text={active.word.s} />
              {cards.has(active.word.id) ? (
                <span className="pill">In your deck</span>
              ) : (
                <button type="button" className="btn" onClick={() => addToDeck(active.word!.id)}>
                  Add to my deck
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {active && !active.word && active.pinyin && (
        <div className="sheet-back" role="presentation" onClick={() => setOpen(null)}>
          <div className="sheet" role="dialog" aria-label="Character" onClick={(event) => event.stopPropagation()}>
            <div className="hanzi lg" lang="zh-CN">{active.text}</div>
            <PinyinLine pinyin={active.pinyin} />
            <p className="muted">Character reading. It is not a separate HSK headword.</p>
            <div className="row">
              <SpeakButton text={active.text} />
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Pinyin above every character, without buttons, so it can sit inside another control. */
export function RubyText({ text, showPinyin }: { text: string; showPinyin?: boolean }) {
  const { settings, index } = useApp();
  const tokens = useMemo(() => annotate(text, index), [text, index]);
  const pinyinOn = showPinyin ?? settings.showPinyin;
  return <RubyRow tokens={tokens} pinyinOn={pinyinOn} toneColors={settings.toneColors} traditional={settings.traditional} />;
}

function RubyRow({
  tokens,
  pinyinOn,
  toneColors,
  traditional,
  onOpen,
}: {
  tokens: RubyToken[];
  pinyinOn: boolean;
  toneColors: boolean;
  traditional: boolean;
  onOpen?: (index: number) => void;
}) {
  return (
    <div className="glossary-text" lang={traditional ? 'zh-TW' : 'zh-CN'}>
      {tokens.map((token, i) => {
        const han = /[\u3400-\u9fff]/.test(token.text);
        if (!han) return <span key={i}>{token.text}</span>;
        const chars = token.word ? displayHanzi(token.word, traditional) : token.text;
        const body = (
          <>
            {pinyinOn && token.pinyin ? <span className="pinyin gloss-py" lang="zh-Latn">{colored(token.pinyin, toneColors)}</span> : null}
            <span className="gloss-zh">{chars}</span>
          </>
        );
        if (!onOpen) return <span key={i} className="gloss">{body}</span>;
        return (
          <button key={i} type="button" className="gloss" onClick={() => onOpen(i)} aria-label={token.pinyin ? `${chars}, ${token.pinyin}` : chars}>
            {body}
          </button>
        );
      })}
    </div>
  );
}

function colored(pinyin: string, enabled: boolean) {
  return splitPinyin(pinyin).map((part, i) => (
    <span key={i} className={toneClass(part.tone, enabled)}>
      {part.text}{' '}
    </span>
  ));
}

export function GoalRing({ seconds, goal }: { seconds: number; goal: number }) {
  const minutes = seconds / 60;
  const pct = Math.max(0, Math.min(1, minutes / goal));
  const r = 42;
  const c = 2 * Math.PI * r;
  const label = minutes < 10 ? String(Math.round(minutes * 10) / 10) : String(Math.round(minutes));
  return (
    <svg className="ring" viewBox="0 0 120 120" role="img" aria-label={`${label} of ${goal} minutes today`}>
      <circle cx="60" cy="60" r={r} className="ring-track" />
      <circle
        cx="60"
        cy="60"
        r={r}
        className="ring-value"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="56" textAnchor="middle" className="ring-num">
        {label}
      </text>
      <text x="60" y="74" textAnchor="middle" className="ring-sub">
        / {goal} min
      </text>
    </svg>
  );
}

export function otherReadings(word: Word, index: LexiconIndex): Word[] {
  return (index.bySimp.get(word.s) ?? []).filter((item) => item.id !== word.id).slice(0, 3);
}
