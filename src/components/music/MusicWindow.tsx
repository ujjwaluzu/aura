import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Heart,
  ListPlus,
  Music2,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useMusic } from '../../hooks/useMusic';
import { usePreferences } from '../../hooks/usePreferences';
import {
  browseMusic,
  appendMusicPage,
  changeMusic,
  openPlayer,
} from '../../features/integrations/music';
import { errorMessage, isDesktop } from '../../lib/native';
import type {
  MusicChange,
  MusicPage,
  MusicQuery,
  MusicTrack,
} from '../../types/music';
import { MusicArtwork } from './MusicArtwork';
import { PlaybackControls } from './PlaybackControls';

const sections = [
  ['search', 'Search'],
  ['playlists', 'Your Playlists'],
  ['liked', 'Liked Videos'],
] as const;
type Section = (typeof sections)[number][0];

export function MusicWindow() {
  const music = useMusic();
  const refreshAccount = music.refresh;
  const { preferences } = usePreferences();
  const [section, setSection] = useState<Section>('playlists');
  const [query, setQuery] = useState<MusicQuery | null>({ kind: 'playlists' });
  const [filter, setFilter] = useState<'music' | 'all'>('music');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<MusicPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [title, setTitle] = useState('');
  const [rename, setRename] = useState('');
  const [addTrack, setAddTrack] = useState<MusicTrack | null>(null);
  const [ratings, setRatings] = useState<Record<string, boolean>>({});
  const isLiked = (track: MusicTrack) =>
    (track.id ? ratings[track.id] : undefined) ?? track.liked;
  const requestVersion = useRef(0);
  const connected = music.account.status === 'connected';
  useEffect(() => {
    if (!connected || !query) return;
    let active = true;
    const request = ++requestVersion.current;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await browseMusic(query);
        if (active && request === requestVersion.current) {
          setPage((previous) =>
            query.pageToken ? appendMusicPage(previous, result) : result,
          );
          setRename(result.playlist?.title ?? '');
          if (!query.pageToken) {
            setUncertain(false);
            setRatings({});
          }
        }
      } catch (error) {
        if (active) {
          setError(errorMessage(error));
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'SESSION_EXPIRED'
          )
            void refreshAccount();
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [connected, query, reload, refreshAccount]);
  useEffect(() => {
    if (connected) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      ++requestVersion.current;
      setPage(null);
      setSearch('');
      setTitle('');
      setRename('');
      setAddTrack(null);
      setNotice(null);
      setUncertain(false);
      setRatings({});
    });
    return () => {
      active = false;
    };
  }, [connected]);
  const selectSection = (next: Section) => {
    setSection(next);
    setPage(null);
    setNotice(null);
    setError(null);
    setAddTrack(null);
    setQuery(next === 'search' ? null : { kind: next });
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(null);
    setNotice(null);
    setQuery({ kind: 'search', query: search.trim(), filter });
  };
  const mutate = async (change: MusicChange) => {
    setWriting(true);
    setError(null);
    setNotice(null);
    try {
      await changeMusic(change);
      if (change.kind === 'like')
        setRatings((current) => ({ ...current, [change.id]: change.liked }));
      setNotice('YouTube confirmed your change.');
      setTitle('');
      setAddTrack(null);
      setQuery((current) =>
        current ? { ...current, pageToken: undefined } : current,
      );
      setReload((n) => n + 1);
    } catch (error) {
      setError(errorMessage(error));
      setUncertain(true);
    } finally {
      setWriting(false);
    }
  };
  const play = async (target: Parameters<typeof openPlayer>[0]) => {
    setError(null);
    try {
      await openPlayer(target);
      setNotice(
        target.player === 'youtube'
          ? 'Opened YouTube. Playback is controlled by the official player.'
          : 'Opened YouTube Music. Playback is controlled by the official player.',
      );
    } catch (error) {
      setError(errorMessage(error));
    }
  };
  const disconnect = async () => {
    ++requestVersion.current;
    // Account content lives only in this window; discard it even if durable
    // credential deletion fails and the native service reports that failure.
    setPage(null);
    setSearch('');
    setTitle('');
    setRename('');
    setAddTrack(null);
    setRatings({});
    setNotice(null);
    setError(null);
    await music.disconnect();
  };
  const writeDisabled = writing || loading || uncertain;
  const showing = connected && query !== null;
  return (
    <main className="music-app" data-theme={preferences.themeId}>
      <aside className="music-sidebar">
        <div className="music-brand">
          <Music2 size={22} />
          <span>Aura Music</span>
        </div>
        <p className="music-provider">YOUTUBE</p>
        <nav aria-label="Music library">
          {sections.map(([id, label]) => (
            <button
              type="button"
              key={id}
              disabled={!connected || writing}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => selectSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="music-account-summary">
          <span>{music.account.name ?? 'Your music, together'}</span>
          {connected && (
            <button
              type="button"
              disabled={writing}
              onClick={() => void disconnect()}
            >
              Disconnect account
            </button>
          )}
        </div>
      </aside>
      <section className="music-content">
        <header className="music-header">
          <div>
            <p className="music-kicker">YOUR DESKTOP COMPANION</p>
            <h1>
              {connected
                ? (page?.playlist?.title ??
                  sections.find(([id]) => id === section)?.[1])
                : 'Bring your library closer'}
            </h1>
          </div>
          <button
            type="button"
            disabled={!isDesktop()}
            onClick={() => void play({ kind: 'home' })}
          >
            Open official player
          </button>
        </header>
        {!connected && (
          <div className="music-onboarding">
            <span className="music-onboarding-icon">
              <Music2 size={36} />
            </span>
            <h2>Your YouTube account, close at hand.</h2>
            <p>
              Browse your owned YouTube playlists and liked videos, search for
              music, and edit playlists here. Playback opens in the official
              YouTube Music browser app, with its account restrictions and
              advertisements.
            </p>
            <p>
              Aura authorization and your browser’s Google sign-in are separate.
              Choose the same Google account in both. Closing this window leaves
              playback running.
            </p>
            {music.loading ? (
              <p role="status">Checking account connection…</p>
            ) : (
              <>
                {music.account.message && (
                  <p className="music-gate-message" role="status">
                    {music.account.message}
                  </p>
                )}
                <button
                  className="music-primary"
                  type="button"
                  disabled={
                    !isDesktop() ||
                    music.busy ||
                    music.account.status === 'unavailable'
                  }
                  onClick={() => void music.connect()}
                >
                  {music.account.status === 'expired'
                    ? 'Reconnect YouTube'
                    : music.busy
                      ? 'Waiting for Google…'
                      : 'Connect YouTube'}
                </button>
                {music.busy && (
                  <>
                    <p role="status">
                      Complete Google sign-in in your browser. If no page opens,
                      cancel and try again. This attempt expires after three
                      minutes.
                    </p>
                    <button type="button" onClick={() => void disconnect()}>
                      Cancel sign-in
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={!isDesktop() || music.busy}
                  onClick={() => void music.refresh()}
                >
                  Check connection again
                </button>
                <button
                  type="button"
                  disabled={!isDesktop() || music.busy}
                  onClick={() => void disconnect()}
                >
                  Clear Aura account data
                </button>
                {!isDesktop() && (
                  <p>
                    Music services are available in the Windows desktop
                    application.
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {music.account.validationBuild && (
          <p className="music-validation-note">
            Developer validation build · account compatibility has not been
            approved for public release.
          </p>
        )}
        {music.error && (
          <p className="music-inline-error" role="alert">
            {music.error}
          </p>
        )}
        {connected && (
          <>
            <div className="music-toolbar">
              {section === 'search' && (
                <form className="music-search" onSubmit={submitSearch}>
                  <Search size={17} />
                  <input
                    aria-label="Search videos"
                    maxLength={200}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find music or a video"
                  />
                  <select
                    aria-label="Search category"
                    value={filter}
                    disabled={writing}
                    onChange={(event) => {
                      setFilter(event.target.value as 'music' | 'all');
                      setPage(null);
                      setQuery(null);
                    }}
                  >
                    <option value="music">Music</option>
                    <option value="all">All videos</option>
                  </select>
                  <button type="submit" disabled={!search.trim() || writing}>
                    Search
                  </button>
                </form>
              )}
              <button
                type="button"
                disabled={loading || writing || !query}
                onClick={() => {
                  setQuery((current) =>
                    current ? { ...current, pageToken: undefined } : current,
                  );
                  setReload((n) => n + 1);
                }}
              >
                Reload view
              </button>
            </div>
            {notice && (
              <p role="status" className="music-success">
                {notice}
              </p>
            )}
            {error && (
              <p className="music-inline-error" role="alert">
                {error}
              </p>
            )}
            {uncertain && (
              <p className="music-inline-error">
                A change may have reached the service. Reload this view before
                making another change.
              </p>
            )}
            {section === 'playlists' && query?.kind === 'playlists' && (
              <form
                className="music-playlist-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate({ kind: 'create', title });
                }}
              >
                <input
                  aria-label="New private playlist name"
                  placeholder="Name a new private playlist"
                  maxLength={150}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <button type="submit" disabled={writeDisabled || !title.trim()}>
                  <Plus size={15} />
                  Create private playlist
                </button>
              </form>
            )}
            {page?.playlist && (
              <div className="music-playlist-tools">
                <button
                  type="button"
                  onClick={() =>
                    void play({ kind: 'playlist', id: page.playlist!.id })
                  }
                >
                  <Play size={14} />
                  Play playlist
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void play({
                      kind: 'playlist',
                      id: page.playlist!.id,
                      player: 'youtube',
                    })
                  }
                >
                  Open playlist on YouTube
                </button>
                {page.playlist.editable ? (
                  <form
                    className="music-playlist-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void mutate({
                        kind: 'rename',
                        id: page.playlist!.id,
                        title: rename,
                      });
                    }}
                  >
                    <input
                      aria-label="Playlist name"
                      value={rename}
                      maxLength={150}
                      onChange={(event) => setRename(event.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={
                        writeDisabled ||
                        !rename.trim() ||
                        rename === page.playlist.title
                      }
                    >
                      Rename
                    </button>
                  </form>
                ) : (
                  <span className="music-muted">
                    This playlist is read-only.
                  </span>
                )}
              </div>
            )}
            {loading && <p role="status">Loading YouTube content…</p>}
            {showing && page && !loading && (
              <>
                <div className="music-playlist-grid">
                  {page.playlists.map((list) => (
                    <button
                      className="music-playlist-tile"
                      type="button"
                      key={list.id}
                      onClick={() => {
                        setPage(null);
                        setQuery({ kind: 'playlist', id: list.id });
                        setSection('playlists');
                      }}
                    >
                      <MusicArtwork url={list.artworkUrl} />
                      <strong>{list.title}</strong>
                      <span>Open playlist</span>
                    </button>
                  ))}
                </div>
                <ol className="music-track-list" aria-label="Videos">
                  {page.tracks.map((track, index) => (
                    <li
                      className="music-track"
                      key={`${track.itemId ?? track.id ?? 'unavailable'}-${index}`}
                    >
                      <MusicArtwork url={track.artworkUrl} />
                      <div className="music-track-copy">
                        <strong title={track.title}>{track.title}</strong>
                        <span>
                          {track.channelTitle || 'Unknown channel'}
                          {track.duration ? ` · ${track.duration}` : ''}
                          {!track.available ? ' · Unavailable' : ''}
                        </span>
                      </div>
                      <div className="music-track-actions">
                        <button
                          type="button"
                          aria-label={`Play ${track.title}`}
                          disabled={!track.available || !track.id}
                          onClick={() =>
                            void play({ kind: 'track', id: track.id! })
                          }
                        >
                          <Play size={15} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Open ${track.title} on YouTube`}
                          disabled={!track.available || !track.id}
                          onClick={() =>
                            void play({
                              kind: 'track',
                              id: track.id!,
                              player: 'youtube',
                            })
                          }
                        >
                          <span aria-hidden="true">YT</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`${isLiked(track) ? 'Unlike' : 'Like'} ${track.title}`}
                          aria-pressed={isLiked(track) === true}
                          disabled={writeDisabled || !track.id}
                          onClick={() =>
                            void mutate({
                              kind: 'like',
                              id: track.id!,
                              liked: !isLiked(track),
                            })
                          }
                        >
                          <Heart
                            size={15}
                            fill={isLiked(track) ? 'currentColor' : 'none'}
                          />
                        </button>
                        <button
                          type="button"
                          aria-label={`Add ${track.title} to playlist`}
                          disabled={
                            writeDisabled || !track.available || !track.id
                          }
                          onClick={() => setAddTrack(track)}
                        >
                          <ListPlus size={16} />
                        </button>
                        {page.playlist?.editable && (
                          <>
                            <button
                              type="button"
                              aria-label={`Move ${track.title} up`}
                              disabled={
                                writeDisabled ||
                                index === 0 ||
                                !track.itemId ||
                                !page.tracks[index - 1]?.itemId
                              }
                              onClick={() =>
                                void mutate({
                                  kind: 'move',
                                  id: page.playlist!.id,
                                  itemId: track.itemId!,
                                  direction: 'up',
                                })
                              }
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${track.title} down`}
                              disabled={
                                writeDisabled ||
                                index === page.tracks.length - 1 ||
                                !track.itemId ||
                                !page.tracks[index + 1]?.itemId
                              }
                              onClick={() =>
                                void mutate({
                                  kind: 'move',
                                  id: page.playlist!.id,
                                  itemId: track.itemId!,
                                  direction: 'down',
                                })
                              }
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${track.title} from playlist`}
                              disabled={writeDisabled || !track.itemId}
                              onClick={() =>
                                void mutate({
                                  kind: 'remove',
                                  id: page.playlist!.id,
                                  itemId: track.itemId!,
                                })
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
                {!page.tracks.length && !page.playlists.length && (
                  <p className="music-empty">
                    No YouTube content here yet. Try a search or create a
                    private playlist.
                  </p>
                )}
                {page.nextPageToken && (
                  <button
                    type="button"
                    disabled={writing || uncertain}
                    onClick={() =>
                      query &&
                      setQuery({ ...query, pageToken: page.nextPageToken! })
                    }
                  >
                    Load more
                  </button>
                )}
              </>
            )}
            {section === 'search' && !query && (
              <p className="music-empty">
                Choose Music or All videos, then submit a search to get started.
              </p>
            )}
            {addTrack && (
              <AddToPlaylist
                key={addTrack.id}
                track={addTrack}
                disabled={writeDisabled}
                cancel={() => setAddTrack(null)}
                add={(id) =>
                  void mutate({ kind: 'add', id, trackId: addTrack.id! })
                }
              />
            )}
          </>
        )}
        <p className="music-muted">
          These are YouTube playlists and videos, not the complete YouTube Music
          library. Some videos cannot play in Music; use Open on YouTube
          instead. Liked Videos exposes up to the most recent 1,000 items
          supported by Google.
        </p>
        <footer className="music-player-footer">
          <PlaybackControls playback={music.playback} />
          <p>
            Choose the session playing YouTube Music. Browser session names
            alone do not identify the provider. Disconnecting Aura does not sign
            you out of your browser.
          </p>
        </footer>
      </section>
    </main>
  );
}

function AddToPlaylist({
  track,
  disabled,
  cancel,
  add,
}: {
  track: MusicTrack;
  disabled: boolean;
  cancel: () => void;
  add: (id: string) => void;
}) {
  const [playlists, setPlaylists] = useState<MusicPage | null>(null);
  const [target, setTarget] = useState('');
  const [editable, setEditable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void browseMusic({ kind: 'playlists' }).then(
      (result) => {
        if (active) setPlaylists(result);
      },
      (error) => {
        if (active) setError(errorMessage(error));
      },
    );
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!target) return;
    let active = true;
    void (async () => {
      setChecking(true);
      setEditable(false);
      setError(null);
      try {
        const result = await browseMusic({
          kind: 'playlist',
          id: target,
        });
        if (active) {
          setEditable(result.playlist?.editable === true);
          if (!result.playlist?.editable)
            setError('This playlist is read-only.');
        }
      } catch (error) {
        if (active) setError(errorMessage(error));
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [target]);
  return (
    <section className="music-add-panel" aria-label="Add to playlist">
      <h2>Add “{track.title}” to a playlist</h2>
      <select
        aria-label="Destination playlist"
        value={target}
        disabled={disabled}
        onChange={(event) => {
          setTarget(event.target.value);
          setEditable(false);
        }}
      >
        <option value="">Choose a playlist</option>
        {playlists?.playlists.map((list) => (
          <option key={list.id} value={list.id}>
            {list.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={disabled || checking || !editable || !target}
        onClick={() => add(target)}
      >
        Add song
      </button>
      <button type="button" disabled={disabled} onClick={cancel}>
        Cancel
      </button>
      {checking && <p role="status">Checking playlist permissions…</p>}
      {!playlists && !error && <p role="status">Loading playlists…</p>}
      {playlists?.nextPageToken && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            void browseMusic({
              kind: 'playlists',
              pageToken: playlists.nextPageToken!,
            }).then(
              (result) =>
                setPlaylists((previous) => appendMusicPage(previous, result)),
              (error) => setError(errorMessage(error)),
            );
          }}
        >
          Load more playlists
        </button>
      )}
      {error && (
        <p role="alert" className="music-inline-error">
          {error}
        </p>
      )}
    </section>
  );
}
