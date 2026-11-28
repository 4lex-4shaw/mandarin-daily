import { Link } from 'react-router-dom';
import { useApp } from '../state';
import { EXERCISE_LABEL } from '../lib/session';
import { heatmapCells, learnedCount, matureCount, streakCount, totals, weakCards } from '../lib/stats';
import { displayHanzi } from '../lib/segment';
import { todayKey } from '../lib/dates';

export function Stats() {
  const { cards, days, index, settings } = useApp();
  const cells = heatmapCells(days);
  const all = totals(days.values());
  const attempts = all.correct + all.wrong;
  const weak = weakCards(cards.values());
  return (
    <div className="stack">
      <h1>Progress</h1>
      <div className="stat-grid">
        <Stat label="Streak" value={`${streakCount(days, todayKey())}d`} />
        <Stat label="Learned" value={String(learnedCount(cards.values()))} />
        <Stat label="Mature" value={String(matureCount(cards.values()))} />
        <Stat label="Accuracy" value={attempts ? `${Math.round((100 * all.correct) / attempts)}%` : '—'} />
      </div>
      <section className="card">
        <p className="eyebrow">Last 17 weeks</p>
        <div className="heat" role="list">
          {cells.map((cell) => (
            <i key={cell.date} role="listitem" data-lv={cell.level} title={`${cell.date}: ${cell.minutes} min`} aria-label={`${cell.date}, ${cell.minutes} minutes`} />
          ))}
        </div>
      </section>
      <section className="stack">
        <p className="eyebrow">Accuracy by exercise</p>
        {Object.keys(all.byType).length === 0 && <p className="muted">Finish a session and this fills in.</p>}
        {Object.entries(all.byType).map(([kind, stat]) => {
          const total = stat.correct + stat.wrong;
          const pct = total ? Math.round((100 * stat.correct) / total) : 0;
          return (
            <div key={kind}>
              <div className="row spread">
                <span>{EXERCISE_LABEL[kind] ?? kind}</span>
                <span className="muted">{pct}% · {total}</span>
              </div>
              <div className="bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </section>
      <section className="stack">
        <div className="row spread">
          <p className="eyebrow">Weak words</p>
          <Link to="/drill">Drill</Link>
        </div>
        {weak.length === 0 && <p className="muted">Nothing shaky yet.</p>}
        <ul className="word-list">
          {weak.map((card) => {
            const word = index.byId.get(card.wordId);
            if (!word) return null;
            return (
              <li key={card.wordId}>
                <Link to={`/words/${encodeURIComponent(word.id)}`}>
                  <strong lang={settings.traditional ? 'zh-TW' : 'zh-CN'}>{displayHanzi(word, settings.traditional)}</strong>
                  <span className="pinyin" lang="zh-Latn">{word.p}</span>
                  <em>{card.lapses} lapse{card.lapses === 1 ? '' : 's'}</em>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="muted tiny">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
