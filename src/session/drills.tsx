import { useEffect, useMemo, useRef, useState } from 'react';
import { Rating, type Grade } from 'ts-fsrs';
import type { Exercise } from '../lib/session';
import { toneNumbers } from '../lib/session';
import { hashString, pinyinMatches, similarity } from '../lib/pinyin';
import { displayHanzi, levelBadges } from '../lib/segment';
import { canRecognizeSpeech, speak, speechRecognitionCtor, stopSpeaking } from '../lib/speech';
import { probeOllama } from '../lib/ollama';
import { generateFreshPassage } from '../lib/readings';
import { loadCharData } from '../lib/strokes';
import type { GrammarPoint } from '../data/grammar';
import type { Passage, Sentence, Word } from '../types';
import { useApp } from '../state';
import { GlossaryText, PinyinLine, RubyText, SpeakButton } from '../components';
import HanziWriter from 'hanzi-writer';

export interface DrillResult {
  kind: string;
  correct: boolean;
  wordId?: string;
  rating?: Grade;
  source: 'flash' | 'objective';
}

const TONE_NAME = ['', '1st', '2nd', '3rd', '4th', 'neutral'];

function shortGloss(meaning: string): string {
  const text = meaning.split(';').slice(0, 2).join('; ').trim();
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

function usePromptAudio(text: string) {
  const { settings } = useApp();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      speak(text, { voiceURI: settings.voiceURI, traditional: settings.traditional, rate: 0.9 });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      stopSpeaking();
    };
  }, [text, settings.voiceURI, settings.traditional]);
}

export function FlashDrill({ exercise, word, onDone }: { exercise: Extract<Exercise, { kind: 'flash' }>; word: Word; onDone: (result: DrillResult) => void }) {
  const { settings, intervalsFor } = useApp();
  const [revealed, setRevealed] = useState(false);
  const labels = intervalsFor(word.id);
  const hanzi = displayHanzi(word, settings.traditional);
  const frontIsChinese = exercise.direction === 'zh-en';
  usePromptAudio(frontIsChinese ? word.s : '');

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (!revealed) setRevealed(true);
      }
      if (!revealed) return;
      const map: Record<string, Grade> = { '1': Rating.Again, '2': Rating.Hard, '3': Rating.Good, '4': Rating.Easy };
      const rating = map[event.key];
      if (rating) {
        event.preventDefault();
        onDone({ kind: 'flash', correct: rating !== Rating.Again, wordId: word.id, rating, source: 'flash' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, onDone, word.id]);

  function grade(rating: Grade) {
    onDone({ kind: 'flash', correct: rating !== Rating.Again, wordId: word.id, rating, source: 'flash' });
  }

  return (
    <div className="drill">
      <p className="eyebrow">{exercise.intro ? 'New word' : frontIsChinese ? 'What does this mean?' : 'How do you say this?'}</p>
      {!revealed ? (
        <>
          {frontIsChinese ? (
            <div className="hanzi xl" lang={settings.traditional ? 'zh-TW' : 'zh-CN'}>{hanzi}</div>
          ) : (
            <p className="prompt-meaning">{shortGloss(word.m)}</p>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setRevealed(true)}>
            Show answer
          </button>
        </>
      ) : (
        <div className="reveal">
          <div className="hanzi xl" lang={settings.traditional ? 'zh-TW' : 'zh-CN'}>{hanzi}</div>
          <PinyinLine pinyin={word.p} />
          <p>{shortGloss(word.m)}</p>
          <p className="muted">{levelBadges(word)}</p>
          <SpeakButton text={word.s} />
          <div className="grades">
            <GradeButton tone="again" label="Again" hint={labels[Rating.Again]} onClick={() => grade(Rating.Again)} />
            <GradeButton tone="hard" label="Hard" hint={labels[Rating.Hard]} onClick={() => grade(Rating.Hard)} />
            <GradeButton tone="good" label="Good" hint={labels[Rating.Good]} onClick={() => grade(Rating.Good)} />
            <GradeButton tone="easy" label="Easy" hint={labels[Rating.Easy]} onClick={() => grade(Rating.Easy)} />
          </div>
          <p className="muted tiny">Keys 1–4 grade after the answer is showing.</p>
        </div>
      )}
    </div>
  );
}

function GradeButton({ label, hint, tone, onClick }: { label: string; hint: string; tone: string; onClick: () => void }) {
  return (
    <button type="button" className={`grade grade-${tone}`} onClick={onClick}>
      <span>{label}</span>
      <small>{hint}</small>
    </button>
  );
}

export function ToneDrill({ word, mode, onDone }: { word: Word; mode: 'tone' | 'tone-pair'; onDone: (result: DrillResult) => void }) {
  const { settings } = useApp();
  const tones = toneNumbers(word);
  const chars = Array.from(displayHanzi(word, settings.traditional));
  const paired = chars.length === tones.length;
  const [picks, setPicks] = useState<number[]>(() => tones.map(() => 0));
  const [result, setResult] = useState<DrillResult | null>(null);
  usePromptAudio(word.s);
  const options = useMemo(() => (mode === 'tone-pair' ? pairOptions(tones, word.id) : []), [mode, tones, word.id]);

  function finish(correct: boolean) {
    const next: DrillResult = {
      kind: mode,
      correct,
      wordId: word.id,
      rating: correct ? Rating.Good : Rating.Again,
      source: 'objective',
    };
    setResult(next);
  }

  return (
    <div className="drill">
      <p className="eyebrow">{mode === 'tone-pair' ? 'Which tone pair did you hear?' : 'Which tones did you hear?'}</p>
      <div className="hanzi xl" lang={settings.traditional ? 'zh-TW' : 'zh-CN'}>{displayHanzi(word, settings.traditional)}</div>
      <SpeakButton text={word.s} label="Play again" />
      {mode === 'tone-pair' ? (
        <div className="choices">
          {options.map((option) => {
            const picked = result != null;
            const state = !picked ? '' : option.correct ? 'correct' : '';
            return (
              <button
                key={option.key}
                type="button"
                className={`choice ${state}`}
                disabled={picked}
                onClick={() => finish(option.correct)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="tone-columns">
          {tones.map((tone, index) => (
            <div key={index} className="tone-col">
              {tones.length > 1 && <div className="hanzi lg">{paired ? chars[index] : index + 1}</div>}
              <div className="tone-keys">
                {[1, 2, 3, 4, 5].filter((n) => n < 5 || tone === 5).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`tone-key ${picks[index] === n ? 'on' : ''}`}
                    aria-label={TONE_NAME[n]}
                    aria-pressed={picks[index] === n}
                    disabled={result != null}
                    onClick={() => setPicks((prev) => prev.map((value, i) => (i === index ? n : value)))}
                  >
                    {TONE_NAME[n]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {result == null && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={picks.some((pick) => pick === 0)}
              onClick={() => finish(picks.every((pick, i) => pick === tones[i]))}
            >
              Check tones
            </button>
          )}
        </div>
      )}
      {result && (
        <>
          <p className={result.correct ? 'good-text' : 'bad-text'} role="status">
            {result.correct ? 'Tones match.' : `It was ${tones.map((tone) => TONE_NAME[tone]).join(' + ')}.`}
          </p>
          <PinyinLine pinyin={word.p} />
          <button type="button" className="btn btn-primary" onClick={() => onDone(result)}>Continue</button>
        </>
      )}
    </div>
  );
}

function pairOptions(tones: number[], salt: string): { key: string; label: string; correct: boolean }[] {
  const alts: number[][] = [];
  tones.forEach((tone, index) => {
    for (const next of [1, 2, 3, 4]) {
      if (next === tone) continue;
      alts.push(tones.map((value, i) => (i === index ? next : value)));
    }
  });
  const uniq: number[][] = [];
  const seen = new Set([tones.join('-')]);
  for (const alt of alts) {
    const key = alt.join('-');
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(alt);
  }
  const chosen = [tones, ...uniq.slice(0, 3)];
  const shift = hashString(salt) % chosen.length;
  const ordered = chosen.map((_, i) => chosen[(i + shift) % chosen.length]);
  return ordered.map((pattern) => ({
    key: pattern.join('-'),
    label: pattern.map((tone) => TONE_NAME[tone]).join(' + '),
    correct: pattern.every((tone, i) => tone === tones[i]),
  }));
}

export function ListenDrill({
  exercise,
  sentence,
  onDone,
}: {
  exercise: Extract<Exercise, { kind: 'listen' }>;
  sentence: Sentence;
  onDone: (result: DrillResult) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  usePromptAudio(sentence.zh);
  const correct = picked != null && picked === exercise.answer;
  return (
    <div className="drill">
      <p className="eyebrow">What does this sentence mean?</p>
      <SpeakButton text={sentence.zh} label="Play the sentence" />
      <div className="choices">
        {exercise.choices.map((choice, index) => {
          const state = picked == null ? '' : index === exercise.answer ? 'correct' : index === picked ? 'wrong' : '';
          return (
            <button key={choice} type="button" className={`choice ${state}`} disabled={picked != null} onClick={() => setPicked(index)}>
              {choice}
            </button>
          );
        })}
      </div>
      {picked != null && (
        <>
          <GlossaryText text={sentence.zh} />
          <p className="muted">{sentence.en}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              onDone({
                kind: 'listen',
                correct,
                wordId: exercise.wordId,
                rating: correct ? Rating.Good : Rating.Again,
                source: 'objective',
              })
            }
          >
            Continue
          </button>
        </>
      )}
    </div>
  );
}

export function DictateDrill({ exercise, word, onDone }: { exercise: Extract<Exercise, { kind: 'dictate' }>; word: Word; onDone: (result: DrillResult) => void }) {
  const [value, setValue] = useState('');
  const [hint, setHint] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [typedOk, setTypedOk] = useState<boolean | null>(null);
  usePromptAudio(word.s);
  const finished = picked != null || typedOk != null;
  const correct = typedOk === true || (picked != null && picked === exercise.answer);

  function checkTyped() {
    const verdict = pinyinMatches(value, word.n);
    if (verdict === 'need-tones') {
      setHint('Add the tones. Numbers are fine: ni3 hao3.');
      return;
    }
    setTypedOk(verdict === 'match');
    setHint(verdict === 'match' ? 'Pinyin matches.' : 'Not quite.');
  }

  return (
    <div className="drill">
      <p className="eyebrow">Listen and write the pinyin, or tap the word.</p>
      <SpeakButton text={word.s} label="Play the word" />
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!finished) checkTyped();
        }}
      >
        <label className="field">
          <span className="sr-only">Pinyin</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="nǐ hǎo or ni3 hao3"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={finished}
          />
        </label>
        {!finished && (
          <button type="submit" className="btn">
            Check pinyin
          </button>
        )}
      </form>
      {hint && <p role="status">{hint}</p>}
      <div className="choices">
        {exercise.choices.map((choice, index) => {
          const state = picked == null && typedOk == null ? '' : index === exercise.answer ? 'correct' : index === picked ? 'wrong' : '';
          return (
            <button
              key={`${choice}-${index}`}
              type="button"
              className={`choice han-choice ${state}`}
              lang="zh-CN"
              disabled={finished}
              onClick={() => setPicked(index)}
            >
              {choice}
            </button>
          );
        })}
      </div>
      {finished && (
        <>
          <PinyinLine pinyin={word.p} />
          <p className="muted">{word.m}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              onDone({
                kind: 'dictate',
                correct,
                wordId: word.id,
                rating: correct ? Rating.Good : Rating.Again,
                source: 'objective',
              })
            }
          >
            Continue
          </button>
        </>
      )}
    </div>
  );
}

export function SpeakDrill({ word, sentence, onDone }: { word: Word; sentence?: Sentence; onDone: (result: DrillResult) => void }) {
  const { settings } = useApp();
  const target = sentence?.zh ?? word.s;
  const [heard, setHeard] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const recRef = useRef<MediaRecorder | null>(null);
  const supported = canRecognizeSpeech();
  usePromptAudio(target);

  useEffect(() => () => {
    recRef.current?.stop();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  function recognize() {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) {
      setError('Speech recognition is not available in this browser.');
      return;
    }
    setError('');
    setHeard('');
    setScore(null);
    const rec = new Ctor();
    rec.lang = 'zh-CN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? '';
      const next = similarity(text, target);
      setHeard(text);
      setScore(next);
    };
    rec.onerror = () => {
      setError('The microphone could not be used. Listen, say it, then grade yourself.');
    };
    rec.start();
  }

  async function record() {
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const url = URL.createObjectURL(new Blob(chunks));
        setAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      window.setTimeout(() => {
        if (rec.state === 'recording') rec.stop();
        setRecording(false);
      }, 4000);
    } catch {
      setError('Recording is blocked. You can still listen and grade yourself.');
    }
  }

  const autoGood = score != null && score >= 0.85;
  const autoHard = score != null && score >= 0.6 && score < 0.85;

  function finish(rating: Grade) {
    onDone({
      kind: 'speak',
      correct: rating !== Rating.Again,
      wordId: word.id,
      rating,
      source: 'objective',
    });
  }

  return (
    <div className="drill">
      <p className="eyebrow">Say this aloud</p>
      <div className="hanzi xl" lang={settings.traditional ? 'zh-TW' : 'zh-CN'}>
        {sentence ? sentence.zh : displayHanzi(word, settings.traditional)}
      </div>
      <PinyinLine pinyin={sentence?.py ?? word.p} />
      {!sentence && <p className="muted">{word.m.split(';')[0]}</p>}
      <div className="row">
        <SpeakButton text={target} label="Play the model" />
        {supported && (
          <button type="button" className="btn" onClick={recognize}>
            Check my pronunciation
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => void record()}>
          {recording ? 'Stop' : 'Record and compare'}
        </button>
      </div>
      {heard && (
        <p role="status">
          Heard: <span lang="zh-CN">{heard}</span>
          {score != null && ` · ${Math.round(score * 100)}%`}
        </p>
      )}
      {audioUrl && <audio controls src={audioUrl} />}
      {error && <p className="banner">{error}</p>}
      {(autoGood || autoHard) && (
        <button type="button" className="btn btn-primary" onClick={() => finish(autoGood ? Rating.Good : Rating.Hard)}>
          {autoGood ? 'That matched — continue' : 'Close enough — continue'}
        </button>
      )}
      <p className="muted">No recognizer, or it missed you? Grade yourself.</p>
      <div className="grades">
        <GradeButton tone="again" label="Again" hint="retry" onClick={() => finish(Rating.Again)} />
        <GradeButton tone="hard" label="Hard" hint="shaky" onClick={() => finish(Rating.Hard)} />
        <GradeButton tone="good" label="Good" hint="clear" onClick={() => finish(Rating.Good)} />
      </div>
    </div>
  );
}

export function BuildDrill({ exercise, sentence, onDone }: { exercise: Extract<Exercise, { kind: 'build' }>; sentence: Sentence; onDone: (result: DrillResult) => void }) {
  const { index, settings } = useApp();
  const [bank, setBank] = useState(() => shuffleTiles(sentence.tiles, sentence.id));
  const [placed, setPlaced] = useState<{ text: string; id: number }[]>([]);
  const [wrong, setWrong] = useState(false);
  const [show, setShow] = useState(false);

  function label(text: string) {
    const hit = index.bySimp.get(text)?.[0];
    return hit ? displayHanzi(hit, settings.traditional) : text;
  }

  function check() {
    const ok = placed.map((tile) => tile.text).join('') === sentence.tiles.join('');
    if (ok) setShow(true);
    else setWrong(true);
  }

  return (
    <div className="drill">
      <p className="eyebrow">Build the sentence</p>
      <p className="prompt-meaning">{sentence.en}</p>
      <div className={`tile-row answer ${wrong && !show ? 'shake' : ''}`} aria-label="Your sentence">
        {placed.length === 0 && <span className="muted">Tap tiles below</span>}
        {placed.map((tile) => (
          <button key={tile.id} type="button" className="tile" disabled={show} onClick={() => {
            setPlaced((prev) => prev.filter((item) => item.id !== tile.id));
            setBank((prev) => [...prev, tile]);
            setWrong(false);
          }}>
            {label(tile.text)}
          </button>
        ))}
      </div>
      <div className="tile-row" aria-label="Word tiles">
        {bank.map((tile) => (
          <button key={tile.id} type="button" className="tile" disabled={show} onClick={() => {
            setBank((prev) => prev.filter((item) => item.id !== tile.id));
            setPlaced((prev) => [...prev, tile]);
            setWrong(false);
          }}>
            {label(tile.text)}
          </button>
        ))}
      </div>
      {!show && (
        <button type="button" className="btn" disabled={placed.length !== sentence.tiles.length} onClick={check}>
          Check
        </button>
      )}
      {wrong && !show && <p className="bad-text">Not yet. You can rearrange, or reveal it.</p>}
      {wrong && !show && (
        <button type="button" className="btn btn-ghost" onClick={() => setShow(true)}>
          Show the sentence
        </button>
      )}
      {show && (
        <>
          <GlossaryText text={sentence.zh} />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              onDone({
                kind: 'build',
                correct: !wrong,
                wordId: exercise.wordId,
                rating: wrong ? Rating.Again : Rating.Good,
                source: 'objective',
              })
            }
          >
            Continue
          </button>
        </>
      )}
    </div>
  );
}

function shuffleTiles(tiles: string[], salt: string) {
  const items = tiles.map((text, id) => ({ text, id }));
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = hashString(`${salt}:${i}`) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  if (copy.every((tile, i) => tile.text === tiles[i]) && copy.length > 1) {
    [copy[0], copy[1]] = [copy[1], copy[0]];
  }
  return copy;
}

export function WriteDrill({ word, char, onDone }: { word: Word; char: string; onDone: (result: DrillResult) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState<DrillResult | null>(null);
  const { settings } = useApp();

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.replaceChildren();
    let writer: HanziWriter | null = null;
    let dead = false;
    const styles = getComputedStyle(document.documentElement);
    try {
      writer = HanziWriter.create(el, char, {
        width: 260,
        height: 260,
        padding: 12,
        showOutline: true,
        showCharacter: false,
        showHintAfterMisses: 2,
        strokeColor: styles.getPropertyValue('--accent').trim() || '#c2412d',
        outlineColor: styles.getPropertyValue('--line').trim() || '#e7e0d6',
        drawingColor: styles.getPropertyValue('--ink').trim() || '#1c1917',
        highlightColor: styles.getPropertyValue('--jade').trim() || '#1f7a4d',
        charDataLoader(character, onLoad, onError) {
          loadCharData(character, (data) => onLoad(data as Parameters<typeof onLoad>[0]), (err) => {
            onError(err);
            if (!dead) setFailed(true);
          });
        },
      });
      void writer.quiz({
        onComplete(summary) {
          if (dead) return;
          const mistakes = summary.totalMistakes;
          const rating = mistakes === 0 ? Rating.Easy : mistakes <= 3 ? Rating.Good : Rating.Hard;
          setDone({ kind: 'write', correct: true, wordId: word.id, rating, source: 'objective' });
        },
      }).catch(() => {
        if (!dead) setFailed(true);
      });
    } catch {
      setFailed(true);
    }
    return () => {
      dead = true;
      try {
        writer?.cancelQuiz();
      } catch {
        /* already gone */
      }
      el.replaceChildren();
    };
  }, [char, word.id]);

  return (
    <div className="drill">
      <p className="eyebrow">Write the character in stroke order</p>
      <p className="muted">{word.m.split(';')[0]} · <span className="pinyin" lang="zh-Latn">{word.p}</span></p>
      <div className="writer-box" ref={box} />
      {settings.traditional && <p className="muted tiny">Stroke order follows the simplified form {char}.</p>}
      {failed && <p className="banner">Stroke data did not load. Trace it on paper, then grade yourself.</p>}
      {failed && !done && (
        <div className="grades">
          <GradeButton tone="again" label="Again" hint="missed" onClick={() => setDone({ kind: 'write', correct: false, wordId: word.id, rating: Rating.Again, source: 'objective' })} />
          <GradeButton tone="good" label="Good" hint="traced" onClick={() => setDone({ kind: 'write', correct: true, wordId: word.id, rating: Rating.Good, source: 'objective' })} />
        </div>
      )}
      {!failed && !done && (
        <button type="button" className="btn btn-ghost" onClick={() => setDone({ kind: 'write', correct: false, wordId: word.id, rating: Rating.Again, source: 'objective' })}>
          Skip
        </button>
      )}
      {done && (
        <button type="button" className="btn btn-primary" onClick={() => onDone(done)}>
          Continue
        </button>
      )}
    </div>
  );
}

export function ReadDrill({ passage, onDone }: { passage: Passage; onDone: (result: DrillResult) => void }) {
  const { settings, cards, index } = useApp();
  const [current, setCurrent] = useState(passage);
  const [answers, setAnswers] = useState<number[]>(() => passage.questions.map(() => -1));
  const [checked, setChecked] = useState(false);
  const [canFresh, setCanFresh] = useState(false);
  const [making, setMaking] = useState(false);
  const correct = current.questions.every((question, i) => answers[i] === question.answer);

  useEffect(() => {
    let cancel = false;
    void probeOllama(settings.ollamaUrl).then((ok) => {
      if (!cancel) setCanFresh(ok);
    });
    return () => {
      cancel = true;
    };
  }, [settings.ollamaUrl]);

  async function fresh() {
    setMaking(true);
    const words = [...cards.values()]
      .sort((a, b) => b.lapses - a.lapses || a.due - b.due)
      .map((card) => index.byId.get(card.wordId)?.s)
      .filter((word): word is string => !!word)
      .slice(0, 12);
    const made = await generateFreshPassage({
      url: settings.ollamaUrl,
      model: settings.ollamaModel,
      level: settings.level,
      words,
    });
    if (made) {
      setCurrent(made);
      setAnswers(made.questions.map(() => -1));
      setChecked(false);
    }
    setMaking(false);
  }

  return (
    <article className="drill reading">
      <p className="eyebrow">{current.format ?? 'Short reading'}</p>
      <h2><RubyText text={current.title} /></h2>
      {canFresh && !checked && (
        <button type="button" className="btn btn-ghost" onClick={() => void fresh()} disabled={making}>
          {making ? 'Writing…' : 'Fresh story'}
        </button>
      )}
      {current.paragraphs.map((paragraph) => (
        <GlossaryText key={paragraph} text={paragraph} />
      ))}
      {current.questions.map((question, qi) => (
        <fieldset key={question.prompt} className="quiz-q" disabled={checked}>
          <legend>{question.prompt}</legend>
          {question.options.map((option, oi) => {
            const state = !checked ? '' : oi === question.answer ? 'correct' : answers[qi] === oi ? 'wrong' : '';
            return (
              <label key={option} className={`choice ${state}`}>
                <input
                  type="radio"
                  name={`q-${qi}`}
                  checked={answers[qi] === oi}
                  onChange={() => setAnswers((prev) => prev.map((value, i) => (i === qi ? oi : value)))}
                />
                {option}
              </label>
            );
          })}
        </fieldset>
      ))}
      {!checked ? (
        <button type="button" className="btn btn-primary" disabled={answers.some((answer) => answer < 0)} onClick={() => setChecked(true)}>
          Check
        </button>
      ) : (
        <>
          <p role="status">{correct ? 'You followed the passage.' : 'The highlighted answers are the ones that fit.'}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onDone({ kind: 'read', correct, source: 'objective' })}
          >
          Finish reading
        </button>
        </>
      )}
    </article>
  );
}

export function GrammarDrill({ point, quizIndex, onDone }: { point: GrammarPoint; quizIndex: number; onDone: (result: DrillResult) => void }) {
  const quiz = point.quiz[quizIndex % point.quiz.length];
  const [picked, setPicked] = useState<number | null>(null);
  const correct = picked === quiz.answer;

  return (
    <div className="drill stack">
      <p className="eyebrow">Grammar · {point.title}</p>
      <RubyText text={quiz.prompt} />
      <div className="stack">
        {quiz.options.map((option, index) => {
          const state = picked == null ? '' : index === quiz.answer ? 'correct' : index === picked ? 'wrong' : '';
          return (
            <button key={option} type="button" className={`choice ${state}`} disabled={picked != null} onClick={() => setPicked(index)}>
              <RubyText text={option} />
            </button>
          );
        })}
      </div>
      {picked != null && (
        <button type="button" className="btn btn-primary" onClick={() => onDone({ kind: 'grammar', correct, source: 'objective' })}>
          Continue
        </button>
      )}
    </div>
  );
}
