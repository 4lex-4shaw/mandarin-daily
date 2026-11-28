# Mandarin Daily

A free, private daily practice app for Mandarin. It runs as a static site: no account, no backend, and no paid API. Progress stays in IndexedDB on your device, and you can export or import it as JSON.

Live app: [https://4lex-4shaw.github.io/mandarin-daily/](https://4lex-4shaw.github.io/mandarin-daily/)

## Features

- Onboarding picks HSK 2.0 levels 1–6 or new HSK 3.0 bands (including 7–9), or a short placement quiz, plus a 10, 20, or 30 minute daily goal.
- **Practice today** builds a mixed session: due FSRS reviews, a few new words, then a rotating set of exercises.
  - Flashcards in both directions, with Again / Hard / Good / Easy.
  - Tone drills and tone-pair listening.
  - Sentence listening (choose the meaning) and dictation (type pinyin or tap the characters).
  - Speaking, scored with the browser Web Speech API (`zh-CN`) when it exists, otherwise record-and-compare or self-grade.
  - Sentence building with word tiles.
  - Stroke-order quizzes with hanzi-writer.
  - A short graded reading. Tap a word for pinyin and a gloss.
- Pinyin can be shown or hidden, with optional tone colors. Simplified characters are the default; traditional is a toggle.
- Progress: streak, daily goal ring, calendar heatmap, learned and mature counts, accuracy by exercise, and a weak-word drill.
- Dictionary search across the bundled lists, add-to-deck, and custom words.
- Optional daily reminder through the Notifications API. It only runs while the app is open. Installed PWAs still cannot promise a real background alarm without a push server, and iOS is especially limited.
- Optional **Talk** tab. It chats with a local [Ollama](https://ollama.com) model (default `http://localhost:11434`, model `qwen3-abliterated`). The tutor replies in Chinese; tap a reply for pinyin and English. The rest of the app does not need Ollama.

Audio uses `speechSynthesis` and the best installed `zh-CN` voice (or `zh-TW` when traditional characters are on). If none is installed, the app says so and keeps going without audio.

The site is a mobile-first PWA. After the first load it works offline, including the bundled HSK 1–2 stroke data. Other characters are fetched once from jsDelivr and then cached.

## Run locally

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:5173/mandarin-daily/](http://localhost:5173/mandarin-daily/). The dev server uses the same base path as GitHub Pages. Hash routes look like `/mandarin-daily/#/practice`.

Production build:

```bash
npm run build
npm run preview
```

## Ollama

The Talk tab is optional. Opening it preloads the model and keeps it loaded for 30 minutes (`keep_alive`). A cold load of a large model can take a minute or two; the tab waits up to 5 minutes and shows a loading state with Cancel, instead of treating that wait as a connection failure. In the terminal that starts Ollama, allow this site’s origin:

```bash
OLLAMA_ORIGINS=https://4lex-4shaw.github.io ollama serve
```

For local dev, include `http://localhost:5173` as well (comma-separated). Pull whatever model name you set in Settings. The default name is `qwen3-abliterated`. Chrome allows an https page to call `http://localhost`. Some other browsers block that mixed request. If Ollama is unreachable, the tab explains why and the rest of the app still works.

## Data and licenses

The app code is MIT. See [LICENSE](LICENSE). Bundled data keeps its own licenses:

| Data | Source | License |
| --- | --- | --- |
| HSK 2.0 and HSK 3.0 levels | [Complete HSK Vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) by Yanis Zafirópulos | MIT |
| English definitions | [CC-CEDICT](https://cc-cedict.org) / MDBG | CC BY-SA 4.0 |
| Practice sentences | [Tatoeba](https://tatoeba.org) contributors, via the curated extract at [manythings.org/anki](https://www.manythings.org/anki/) | CC BY 2.0 |
| Readings and a few starter sentences | Written for this app | CC BY 2.0 |
| Stroke quizzes | [hanzi-writer](https://github.com/chanind/hanzi-writer) and [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) / Make Me a Hanzi | MIT and the Arphic Public License for the outlines |
| Scheduling | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | MIT |

Copies of the notices ship in `public/licenses/` and on the About page. `src/data/lexicon.json` includes CC-CEDICT text, so that file stays under CC BY-SA 4.0.

A handful of everyday phrases that are not separate headwords in the HSK list (你好, 早上好) were added from CC-CEDICT at HSK 1. Heteronym headwords prefer the common learner reading; other readings stay searchable.

Regenerate the bundles only if you refresh the raw inputs under `data/raw/` (gitignored):

```bash
npm run prepare-data
```

## Deploy

GitHub Pages is built by [`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push to `main`, using `actions/upload-pages-artifact` and `actions/deploy-pages`. The Vite `base` is `/mandarin-daily/`.

## Known limits

- Speech recognition is a Chromium feature (Chrome, Edge, and some Android browsers). It often sends audio to the browser vendor, so it is not fully offline. Safari support is partial. Firefox does not implement it. The speaking exercise falls back to recording and self-grading.
- Chinese text-to-speech depends on a voice installed in the OS or browser. Linux desktops often have none.
- Stroke order for characters outside HSK 1–2 needs one network fetch, then the service worker keeps it.
- Notifications are best-effort and only while the app is open.
- The Talk tab needs Ollama running locally with `OLLAMA_ORIGINS` set. It is not required for practice.
