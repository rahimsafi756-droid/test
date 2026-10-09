import { REGIONS, UI_LANGUAGES } from '../../shared/genres.ts';
import type { Settings } from '../lib/store.ts';
import { actions, useStore } from '../lib/store.ts';

export function SettingsPage() {
  const s = useStore((st) => st.settings);
  return (
    <div className="page page-pad narrow">
      <h1>Einstellungen</h1>
      <p className="muted small">Einstellungen werden lokal in diesem Browser gespeichert.</p>

      <div className="form">
        <label>
          <span>Region</span>
          <select value={s.region} onChange={(e) => actions.updateSettings({ region: e.target.value })}>
            {REGIONS.map((r) => (
              <option key={r.code} value={r.code}>{r.label}</option>
            ))}
          </select>
          <small className="muted">Bestimmt, welche Anbieter angezeigt werden und für welche Region Freigaben und Geosperren geprüft werden. Eine andere Region hebt keine technischen Geosperren auf.</small>
        </label>

        <label>
          <span>Sprache der Inhalte</span>
          <select value={s.language} onChange={(e) => actions.updateSettings({ language: e.target.value as Settings['language'] })}>
            {UI_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          <small className="muted">Sprache für Titel und Beschreibungen (sofern die Quelle Übersetzungen hat). Die Oberfläche ist auf Deutsch.</small>
        </label>

        <fieldset>
          <legend>Lizenzprüfung für „Direkt ansehen“</legend>
          <label className="radio">
            <input type="radio" name="trust" checked={s.trust === 'strict'} onChange={() => actions.updateSettings({ trust: 'strict' })} />
            <span>
              <strong>Streng (empfohlen)</strong> – nur belegte Freigaben: freie Lizenz oder Gemeinfreiheit für deine Region laut Wikidata/Commons sowie offizielle Sender-Streams.
            </span>
          </label>
          <label className="radio">
            <input type="radio" name="trust" checked={s.trust === 'extended'} onChange={() => actions.updateSettings({ trust: 'extended' })} />
            <span>
              <strong>Erweitert</strong> – zusätzlich Internet-Archive-Filme, deren Lizenz nur vom Uploader angegeben wurde. Diese Angaben sind nicht unabhängig geprüft.
            </span>
          </label>
        </fieldset>

        <div>
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (confirm('Merkliste, Verlauf, Fortschritt und Einstellungen in diesem Browser löschen?')) actions.resetAll();
            }}
          >
            Alle lokalen Daten löschen
          </button>
        </div>
      </div>
    </div>
  );
}
