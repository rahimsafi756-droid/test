import Hls, { type ErrorData } from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import type { PlaybackSource } from '../../shared/types.ts';
import { actions, getProgress } from '../lib/store.ts';

export interface PlayerMeta {
  /** Schlüssel für gespeicherten Fortschritt (nur Video-on-Demand) */
  progressKey?: string;
  title: string;
  subtitle?: string;
  posterUrl?: string;
  href: string;
}

interface Props {
  source: PlaybackSource;
  alternatives: PlaybackSource[];
  meta: PlayerMeta;
  live?: boolean;
  onSwitch: (s: PlaybackSource) => void;
}

interface Option {
  id: number;
  label: string;
}

type Status = 'loading' | 'playing' | 'paused' | 'error' | 'stalled';

function mediaErrorText(code: number | undefined): string {
  switch (code) {
    case 1:
      return 'Die Wiedergabe wurde abgebrochen.';
    case 2:
      return 'Netzwerkfehler beim Laden des Videos.';
    case 3:
      return 'Das Video konnte nicht dekodiert werden (Format/Codec).';
    case 4:
      return 'Dieses Videoformat wird von deinem Browser nicht unterstützt oder die Quelle ist nicht erreichbar.';
    default:
      return 'Das Video konnte nicht abgespielt werden.';
  }
}

function hlsErrorText(d: ErrorData): string {
  const status = (d.response as { code?: number } | undefined)?.code;
  if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
    if (status === 403 || status === 451) return 'Der Sender liefert den Stream für deine Region nicht aus (Geosperre) oder verweigert den Zugriff.';
    if (status === 404) return 'Der Stream existiert unter dieser Adresse nicht mehr.';
    if (status === 0 || status === undefined)
      return 'Der Stream ist nicht erreichbar. Mögliche Gründe: Sender offline, Geosperre oder die Quelle erlaubt keinen Abruf aus anderen Websites (CORS).';
    return `Netzwerkfehler beim Laden des Streams (HTTP ${status}).`;
  }
  if (d.type === Hls.ErrorTypes.MEDIA_ERROR) return 'Der Stream konnte nicht dekodiert werden.';
  return 'Der Stream konnte nicht abgespielt werden.';
}

export function Player({ source, alternatives, meta, live, onSwitch }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string>();
  const [levels, setLevels] = useState<Option[]>([]);
  const [level, setLevel] = useState(-1);
  const [audio, setAudio] = useState<Option[]>([]);
  const [audioSel, setAudioSel] = useState(0);
  const [subs, setSubs] = useState<Option[]>([]);
  const [subSel, setSubSel] = useState(-1);
  const [engine, setEngine] = useState<string>('');
  const [isLive, setIsLive] = useState(Boolean(live));
  const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;

  // ---- Quelle laden ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video || source.kind === 'youtube') return;
    setStatus('loading');
    setError(undefined);
    setLevels([]);
    setAudio([]);
    setSubs([]);
    setLevel(-1);
    let recoveredMedia = false;
    const fail = (msg: string) => {
      setError(msg);
      setStatus('error');
    };
    // Kein Bild nach 25 s → Hinweis (Stream hängt)
    const watchdog = window.setTimeout(() => {
      if (video.readyState < 2) setStatus((s) => (s === 'loading' ? 'stalled' : s));
    }, 25_000);

    if (source.kind === 'hls' && Hls.isSupported()) {
      setEngine('hls.js');
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 60 });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setLevels(data.levels.map((l, i) => ({ id: i, label: l.height ? `${l.height}p` : l.bitrate ? `${Math.round(l.bitrate / 1000)} kbit/s` : `Stufe ${i + 1}` })));
        video.play().catch(() => setStatus('paused'));
      });
      hls.on(Hls.Events.LEVEL_LOADED, (_e, data) => setIsLive(data.details.live));
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_e, data) => {
        setAudio(data.audioTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Tonspur ${i + 1}` })));
        setAudioSel(hls.audioTrack);
      });
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_e, data) => {
        setSubs(data.subtitleTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Untertitel ${i + 1}` })));
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, () => setLevel(hls.autoLevelEnabled ? -1 : hls.currentLevel));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMedia) {
          recoveredMedia = true;
          hls.recoverMediaError();
          return;
        }
        fail(hlsErrorText(data));
        hls.destroy();
      });
      hls.loadSource(source.url);
      hls.attachMedia(video);
    } else if (source.kind === 'hls' && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / iOS: native HLS-Wiedergabe
      setEngine('nativ (HLS)');
      video.src = source.url;
      video.play().catch(() => setStatus('paused'));
    } else if (source.kind === 'hls') {
      fail('Dein Browser unterstützt keine HLS-Wiedergabe.');
    } else {
      setEngine('nativ');
      if (source.mimeType && video.canPlayType(source.mimeType.split(';')[0]) === '') {
        fail(`Dein Browser kann dieses Format (${source.mimeType.split(';')[0]}) wahrscheinlich nicht abspielen. Wähle eine andere Quelle oder öffne die Originalseite.`);
      }
      video.src = source.url;
      // Start nach Klick des Nutzers (Autoplay-Regeln der Browser erlauben das)
      video.play().catch(() => setStatus((s) => (s === 'error' ? s : 'paused')));
    }

    return () => {
      window.clearTimeout(watchdog);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [source]);

  // ---- Fortschritt (nur VOD, nur direkt abgespielte Quellen) ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video || source.kind === 'youtube' || !meta.progressKey) return;
    const key = meta.progressKey;
    let lastSave = 0;
    const onMeta = () => {
      const saved = getProgress(key);
      if (saved && Number.isFinite(video.duration) && saved.position > 10 && saved.position < video.duration - 30) {
        video.currentTime = saved.position;
      }
    };
    const save = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0 || isLive) return;
      actions.saveProgress({ key, title: meta.title, subtitle: meta.subtitle, posterUrl: meta.posterUrl, href: meta.href, position: video.currentTime, duration: video.duration });
    };
    const onTime = () => {
      if (Date.now() - lastSave > 5000) {
        lastSave = Date.now();
        save();
      }
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('pause', save);
    return () => {
      save();
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('pause', save);
    };
  }, [source, meta.progressKey, meta.title, meta.subtitle, meta.posterUrl, meta.href, isLive]);

  // ---- Status aus Video-Ereignissen ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlaying = () => setStatus('playing');
    const onPause = () => setStatus((s) => (s === 'error' ? s : 'paused'));
    const onWaiting = () => setStatus((s) => (s === 'error' ? s : 'loading'));
    const onReady = () => setStatus((s) => (s === 'loading' || s === 'stalled' ? (video.paused ? 'paused' : 'playing') : s));
    const onError = () => {
      if (hlsRef.current) return; // hls.js meldet eigene Fehler
      setError(mediaErrorText(video.error?.code));
      setStatus('error');
    };
    const onTracks = () => {
      if (hlsRef.current) return;
      const list = Array.from(video.textTracks).map((t, i) => ({ id: i, label: t.label || t.language || `Untertitel ${i + 1}` }));
      setSubs(list);
    };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onReady);
    video.addEventListener('error', onError);
    video.textTracks.addEventListener?.('addtrack', onTracks);
    onTracks();
    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
      video.textTracks.removeEventListener?.('addtrack', onTracks);
    };
  }, [source]);

  const chooseLevel = (v: number) => {
    setLevel(v);
    if (hlsRef.current) hlsRef.current.currentLevel = v;
  };
  const chooseAudio = (v: number) => {
    setAudioSel(v);
    if (hlsRef.current) hlsRef.current.audioTrack = v;
  };
  const chooseSub = (v: number) => {
    setSubSel(v);
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack = v;
      hlsRef.current.subtitleDisplay = v >= 0;
    } else if (videoRef.current) {
      Array.from(videoRef.current.textTracks).forEach((t, i) => (t.mode = i === v ? 'showing' : 'disabled'));
    }
  };
  const togglePip = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      /* vom Browser abgelehnt */
    }
  };
  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (el?.requestFullscreen) await el.requestFullscreen();
      else v?.webkitEnterFullscreen?.(); // iOS
    } catch {
      /* nicht unterstützt */
    }
  };

  const others = alternatives.filter((a) => a.id !== source.id && a.availableInRegion);

  if (source.kind === 'youtube') {
    return (
      <div className="player">
        <div className="player-frame">
          <iframe
            src={`${source.url}?rel=0&autoplay=1`}
            title={source.label}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <div className="player-bar">
          {source.isTrailer ? <span className="tag tag-trailer">Trailer</span> : <span className="tag tag-film">Ganzer Film</span>}
          <span className="player-label">{source.label}</span>
          {source.homepage && (
            <a className="btn btn-ghost" href={source.homepage} target="_blank" rel="noopener noreferrer">
              Auf YouTube ↗
            </a>
          )}
        </div>
        <p className="player-meta">
          Wiedergabe: offizieller YouTube-Player{!source.isTrailer && ' · Fortschritt wird von YouTube verwaltet, nicht von Rahim Cinema'}
          {source.license && !source.isTrailer && <> · {source.license.name}</>}
          {source.regionNote && !source.isTrailer && <> · {source.regionNote}</>}
        </p>
      </div>
    );
  }

  return (
    <div className="player" ref={wrapRef}>
      <div className="player-frame">
        <video ref={videoRef} controls={!error} playsInline preload="metadata" poster={meta.posterUrl} crossOrigin={source.subtitles?.length ? 'anonymous' : undefined}>
          {source.subtitles?.map((t) => <track key={t.url} kind="subtitles" src={t.url} srcLang={t.lang} label={t.label} />)}
        </video>
        {status === 'loading' && !error && <div className="player-overlay"><div className="spinner" aria-label="Lädt" /></div>}
        {status === 'stalled' && (
          <div className="player-overlay">
            <p>Der Stream lädt ungewöhnlich lange. Eventuell ist er gerade offline oder für deine Region gesperrt.</p>
          </div>
        )}
        {error && (
          <div className="player-overlay player-error" role="alert">
            <p><strong>Wiedergabe nicht möglich.</strong> {error}</p>
            <div className="player-actions">
              {others.length > 0 && (
                <button className="btn" onClick={() => onSwitch(others[0])}>
                  Andere geprüfte Quelle versuchen
                </button>
              )}
              {source.homepage && (
                <a className="btn btn-ghost" href={source.homepage} target="_blank" rel="noopener noreferrer">
                  Offizielle Seite öffnen ↗
                </a>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="player-bar">
        {isLive && <span className="tag tag-live">● LIVE</span>}
        <span className="player-label">{source.label}</span>
        <div className="player-controls">
          {levels.length > 1 && (
            <label>
              Qualität
              <select value={level} onChange={(e) => chooseLevel(Number(e.target.value))}>
                <option value={-1}>Automatisch</option>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            </label>
          )}
          {audio.length > 1 && (
            <label>
              Ton
              <select value={audioSel} onChange={(e) => chooseAudio(Number(e.target.value))}>
                {audio.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </label>
          )}
          {subs.length > 0 && (
            <label>
              Untertitel
              <select value={subSel} onChange={(e) => chooseSub(Number(e.target.value))}>
                <option value={-1}>Aus</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
          )}
          {alternatives.length > 1 && (
            <label>
              Quelle
              <select value={source.id} onChange={(e) => onSwitch(alternatives.find((a) => a.id === e.target.value)!)}>
                {alternatives.map((a) => (
                  <option key={a.id} value={a.id} disabled={!a.availableInRegion}>
                    {a.quality ? `${a.quality} · ` : ''}{a.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {pipSupported && (
            <button className="icon-btn" onClick={togglePip} title="Bild-in-Bild" aria-label="Bild-in-Bild">⧉</button>
          )}
          <button className="icon-btn" onClick={toggleFullscreen} title="Vollbild" aria-label="Vollbild">⛶</button>
        </div>
      </div>
      <p className="player-meta">
        Wiedergabe: {engine || '–'}
        {source.license && <> · Lizenz: {source.license.url ? <a href={source.license.url} target="_blank" rel="noopener noreferrer">{source.license.name}</a> : source.license.name}</>}
        {source.regionNote && <> · {source.regionNote}</>}
      </p>
    </div>
  );
}
