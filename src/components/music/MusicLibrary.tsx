import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Heart,
  ListPlus,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useMusic } from '../../hooks/useMusic';
import {
  browseMusic,
  appendMusicPage,
  changeMusic,
  openPlayer,
} from '../../features/integrations/music';
import { errorMessage, musicError } from '../../lib/native';
import type {
  MusicChange,
  MusicPage,
  MusicQuery,
  MusicTrack,
} from '../../types/music';
import { MusicArtwork } from './MusicArtwork';
import { useElementSize } from '../../hooks/useElementSize';
import { PageControls } from '../ui/PageControls';
import { DialogPanel } from '../ui/DialogPanel';

export function MusicLibrary({
  section,
}: {
  section: 'search' | 'playlists' | 'liked';
}) {
  const music = useMusic();
  const refreshAccount = music.refresh;
  const reportError = music.reportError;
  const [query, setQuery] = useState<MusicQuery | null>(
    section === 'search' ? null : { kind: section },
  );
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
  const [editing, setEditing] = useState(false);
  const [info, setInfo] = useState(false);
  const {
    ref: resultsRef,
    width: resultsWidth,
    height: resultsHeight,
  } = useElementSize<HTMLDivElement>();
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
          reportError(error);
          setError(musicError(error));
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
  }, [connected, query, reload, refreshAccount, reportError]);
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
      setEditing(false);
      setQuery((current) =>
        current ? { ...current, pageToken: undefined } : current,
      );
      setReload((n) => n + 1);
    } catch (error) {
      reportError(error);
      setError(musicError(error));
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
      reportError(error);
      setError(musicError(error));
    }
  };
  const writeDisabled = writing || loading || uncertain;
  const reloadView = () => {
    setQuery((current) =>
      current ? { ...current, pageToken: undefined } : current,
    );
    setReload((n) => n + 1);
  };
  const writeFeedback = (
    <>
      {error && (
        <p className="music-inline-error" role="alert">
          {error}
        </p>
      )}
      {uncertain && (
        <>
          <p className="music-inline-error">
            A change may have reached the service. Refresh to check the result
            before editing again.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setAddTrack(null);
              reloadView();
            }}
          >
            Refresh result
          </button>
        </>
      )}
    </>
  );
  const showing = connected && query !== null;
  const playlistMode = query?.kind === 'playlists';
  const columns = playlistMode
    ? Math.max(1, Math.floor((resultsWidth + 8) / 248))
    : 1;
  const capacity =
    Math.max(
      1,
      Math.floor(
        (resultsHeight + (playlistMode ? 8 : 0)) / (playlistMode ? 80 : 60),
      ),
    ) * columns;
  const total = playlistMode
    ? (page?.playlists.length ?? 0)
    : (page?.tracks.length ?? 0);
  const pages = Math.max(1, Math.ceil(total / capacity));
  const viewKey = JSON.stringify(
    query ? { ...query, pageToken: undefined } : null,
  );
  const [navigation, setNavigation] = useState({ key: viewKey, index: 0 });
  if (navigation.key !== viewKey) setNavigation({ key: viewKey, index: 0 });
  const visiblePage = Math.min(navigation.index, pages - 1);
  const start = visiblePage * capacity;
  return (
    <div className="music-library-view">
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
              onClick={reloadView}
            >
              Reload view
            </button>
          </div>
          {notice && (
            <p role="status" className="music-success">
              {notice}
            </p>
          )}
          {error && !editing && !addTrack && (
            <p className="music-inline-error" role="alert">
              {error}
            </p>
          )}
          {uncertain && !editing && !addTrack && (
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
                disabled={writing}
                onClick={() => {
                  setPage(null);
                  setQuery({ kind: 'playlists' });
                }}
              >
                Back to playlists
              </button>
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
                <button type="button" onClick={() => setEditing(true)}>
                  Edit playlist
                </button>
              ) : (
                <span className="music-muted">This playlist is read-only.</span>
              )}
            </div>
          )}
          <div className="music-results" ref={resultsRef}>
            {loading && <p role="status">Loading YouTube content…</p>}
            {showing && page && !loading && (
              <>
                <div
                  className="music-playlist-grid"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  }}
                >
                  {page.playlists.slice(start, start + capacity).map((list) => (
                    <button
                      className="music-playlist-tile"
                      type="button"
                      key={list.id}
                      onClick={() => {
                        setPage(null);
                        setQuery({ kind: 'playlist', id: list.id });
                      }}
                    >
                      <MusicArtwork url={list.artworkUrl} />
                      <strong>{list.title}</strong>
                      <span>
                        {list.editable ? 'Editable playlist' : 'Open playlist'}
                      </span>
                    </button>
                  ))}
                </div>
                {page.tracks.length > 0 && (
                  <ol className="music-track-list" aria-label="Videos">
                    {page.tracks
                      .slice(start, start + capacity)
                      .map((track, localIndex) => {
                        const index = start + localIndex;
                        return (
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
                                  fill={
                                    isLiked(track) ? 'currentColor' : 'none'
                                  }
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
                        );
                      })}
                  </ol>
                )}
                {!page.tracks.length && !page.playlists.length && (
                  <p className="music-empty">
                    No YouTube content here yet. Try a search or create a
                    private playlist.
                  </p>
                )}
              </>
            )}
            {section === 'search' && !query && (
              <p className="music-empty">
                Choose Music or All videos, then submit a search to get started.
              </p>
            )}
          </div>
          <footer className="music-library-footer">
            <PageControls
              page={visiblePage}
              pages={pages}
              onPage={(index) => setNavigation({ key: viewKey, index })}
              label="Results"
            />
            {page?.nextPageToken && (
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
            <button
              type="button"
              onClick={() => setInfo(true)}
              aria-label="YouTube library limits"
            >
              About
            </button>
          </footer>
          {editing && page?.playlist && (
            <DialogPanel
              title="Edit playlist"
              onClose={() => setEditing(false)}
            >
              {writeFeedback}
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
              </form>{' '}
              <p className="music-muted">Editable playlist</p>
            </DialogPanel>
          )}
          {info && (
            <DialogPanel
              title="YouTube library limits"
              onClose={() => setInfo(false)}
            >
              <p>
                These are YouTube playlists and videos, not the complete YouTube
                Music library. Some videos cannot play in Music; use Open on
                YouTube instead. Liked videos exposes up to the most recent
                1,000 items supported by Google.
              </p>
            </DialogPanel>
          )}
          {addTrack && (
            <DialogPanel
              title="Add to playlist"
              onClose={() => setAddTrack(null)}
            >
              {writeFeedback}
              <AddToPlaylist
                key={addTrack.id}
                track={addTrack}
                disabled={writeDisabled}
                cancel={() => setAddTrack(null)}
                add={(id) =>
                  void mutate({ kind: 'add', id, trackId: addTrack.id! })
                }
              />
            </DialogPanel>
          )}
        </>
      )}
    </div>
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
      <p className="music-add-track" title={track.title}>
        {track.title}
      </p>
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
