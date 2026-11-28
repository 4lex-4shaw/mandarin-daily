import { Link } from 'react-router-dom';

export function About() {
  return (
    <div className="stack prose">
      <h1>About</h1>
      <p>Mandarin Daily is a private practice app. There is no account and no server. Progress lives in IndexedDB on this device. Export it as JSON whenever you want a copy.</p>
      <h2>What a session does</h2>
      <p>Reviews are scheduled with FSRS. New words from your HSK level are mixed in, then the session rotates flashcards, tone listening, sentence listening, dictation, speaking, tile sentences, stroke order, and a short reading. Tap any word in a reading for pinyin and a gloss.</p>
      <h2>Data and licenses</h2>
      <ul>
        <li>
          <strong>HSK levels.</strong> Word lists for HSK 2.0 and HSK 3.0 come from <a href="https://github.com/drkameleon/complete-hsk-vocabulary">Complete HSK Vocabulary</a> by Yanis Zafirópulos, MIT. A few everyday phrases that are not separate headwords there (你好, 早上好) were added from CC-CEDICT. The source marks new-HSK bands 7–9 as one list; the level test splits that pool by frequency so it can name band 7, 8, or 9.
        </li>
        <li>
          <strong>Definitions.</strong> English glosses are from <a href="https://cc-cedict.org">CC-CEDICT</a>, licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. The bundled lexicon keeps that license. See <a href={`${import.meta.env.BASE_URL}licenses/CC-CEDICT.txt`}>the local notice</a>.
        </li>
        <li>
          <strong>Sentences.</strong> Practice sentences are from the <a href="https://tatoeba.org">Tatoeba Project</a>, <a href="https://creativecommons.org/licenses/by/2.0/">CC BY 2.0</a>, via the curated cmn–eng extract at manythings.org/anki. Some traditional sentences were converted to simplified, and the set was filtered for length and level. Reading passages and a few starter sentences were written for this app and released under the same CC BY 2.0 terms. The graded readings and the grammar lessons are original, not copied from textbooks. Grammar explanations are written in Chinese for the level they teach. A Fresh story, when Ollama is running, is generated on your computer and is not part of that bundled text.
        </li>
        <li>
          <strong>Stroke order.</strong> Quizzes use <a href="https://github.com/chanind/hanzi-writer">hanzi-writer</a> (MIT). Graphics are from <a href="https://github.com/chanind/hanzi-writer-data">hanzi-writer-data</a> / Make Me a Hanzi, derived from fonts under the Arphic Public License. HSK 1–2 characters are bundled. Others download once from jsDelivr and the service worker caches them.
        </li>
        <li>
          <strong>Scheduling.</strong> <a href="https://github.com/open-spaced-repetition/ts-fsrs">ts-fsrs</a>, MIT.
        </li>
      </ul>
      <p>Source notices are also in the <code>licenses</code> folder shipped with the app.</p>
      <h2>Speech</h2>
      <p>Audio uses the browser’s speechSynthesis and a zh-CN voice if one is installed. Speech recognition uses the Web Speech API, which is mainly Chromium (Chrome, Edge, some Android browsers) and often needs a network round-trip to the browser vendor. Firefox does not implement it. When recognition is missing or fails, you can record yourself and self-grade.</p>
      <h2>Conversation partner</h2>
      <p>The Talk tab is optional. It calls Ollama on your own computer at the URL in Settings (default http://localhost:11434, model qwen3-abliterated). Ollama must allow this site’s origin:</p>
      <pre>{`OLLAMA_ORIGINS=${typeof window === 'undefined' ? 'https://4lex-4shaw.github.io' : window.location.origin} ollama serve`}</pre>
      <p>An https page calling http://localhost works in Chrome’s loopback exception and fails in some other browsers. If Ollama is off, the rest of the app is unaffected.</p>
      <p><Link to="/">Back to today</Link></p>
    </div>
  );
}
