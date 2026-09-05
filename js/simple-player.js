const SEARCH_ENDPOINT = 'https://archive.org/advancedsearch.php';
const METADATA_ENDPOINT = 'https://archive.org/metadata/';
const IMAGE_ENDPOINT = 'https://archive.org/services/img/';
const MUSIC_QUERY = 'mediatype:audio AND collection:netlabels AND format:("VBR MP3" OR "Ogg Vorbis" OR FLAC)';
const DEFAULT_QUERY = MUSIC_QUERY;
const PAGE_SIZE = 24;

const state = {
    tracks: [],
    queue: [],
    currentIndex: -1,
    currentFile: null,
    query: '',
    loading: false,
    status: '',
    statusError: false,
};

const audio = document.createElement('audio');
audio.id = 'simple-audio';
audio.preload = 'metadata';
audio.setAttribute('aria-label', 'Audio player');
audio.hidden = true;

const appRoot = document.createElement('div');
appRoot.id = 'simple-player-root';

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60)
        .toString()
        .padStart(2, '0');
    return `${minutes}:${remaining}`;
}

function trackTitle(track) {
    return track.title || track.identifier || 'Untitled recording';
}

function trackArtist(track) {
    return track.creator || 'Internet Archive contributor';
}

function trackImage(track) {
    return `${IMAGE_ENDPOINT}${encodeURIComponent(track.identifier)}`;
}

function trackCard(track, index) {
    return `
        <article class="track-card" data-track-index="${index}">
            <button class="cover-button" data-action="play-track" data-track-index="${index}" aria-label="Play ${escapeHtml(trackTitle(track))}">
                <img src="${trackImage(track)}" alt="" loading="lazy" />
                <span class="cover-play">Play</span>
            </button>
            <div class="track-card-copy">
                <h3 title="${escapeHtml(trackTitle(track))}">${escapeHtml(trackTitle(track))}</h3>
                <p title="${escapeHtml(trackArtist(track))}">${escapeHtml(trackArtist(track))}</p>
            </div>
            <button class="icon-button" data-action="queue-track" data-track-index="${index}" aria-label="Add ${escapeHtml(trackTitle(track))} to queue" title="Add to queue">+</button>
        </article>
    `;
}

function render() {
    const current = state.queue[state.currentIndex];
    appRoot.innerHTML = `
        <div id="simple-player-app">
            <header class="topbar">
                <a class="brand" href="/" aria-label="Open SongsPlay"><span class="brand-mark">S</span><span>SongsPlay</span></a>
                <div class="source-note">Free, open audio</div>
            </header>
            <main class="layout">
                <section class="browse-panel" aria-labelledby="browse-title">
                    <div class="intro">
                        <p class="eyebrow">A quiet place to listen</p>
                        <h1 id="browse-title">Find something worth hearing.</h1>
                        <p class="intro-copy">Search openly licensed recordings from the Internet Archive. No account, subscription, or tracking.</p>
                    </div>
                    <form class="search-form" id="search-form">
                        <label class="search-box"><span class="sr-only">Search music</span><input id="search-input" name="query" value="${escapeHtml(state.query)}" placeholder="Search artists, albums, recordings" autocomplete="off" /><button type="submit" aria-label="Search">Search</button></label>
                    </form>
                    <div class="section-heading"><h2>${state.query ? `Results for &quot;${escapeHtml(state.query)}&quot;` : 'Open audio to explore'}</h2><span>${state.tracks.length} recordings</span></div>
                    <div class="track-grid" id="track-grid">
                        ${state.loading ? '<p class="status">Looking through the archive...</p>' : state.tracks.map(trackCard).join('')}
                    </div>
                    <p class="status${state.statusError ? ' error' : ''}" id="browse-status" role="status">${escapeHtml(state.status)}</p>
                </section>
                <aside class="queue-panel" aria-labelledby="queue-title">
                    <div class="queue-heading"><div><p class="eyebrow">Up next</p><h2 id="queue-title">Queue</h2></div><button class="text-button" data-action="clear-queue">Clear</button></div>
                    <div class="queue-list" id="queue-list">
                        ${state.queue.length ? state.queue.map((track, index) => `<button class="queue-item ${index === state.currentIndex ? 'active' : ''}" data-action="play-queue-item" data-queue-index="${index}"><img src="${trackImage(track)}" alt="" /><span><strong>${escapeHtml(trackTitle(track))}</strong><small>${escapeHtml(trackArtist(track))}</small></span></button>`).join('') : '<p class="empty-state">Your queue is empty.<br />Add a recording to begin.</p>'}
                    </div>
                </aside>
            </main>
            <footer class="player-bar" aria-label="Now playing">
                <div class="now-playing">
                    ${current ? `<img src="${trackImage(current)}" alt="" /><div><strong>${escapeHtml(trackTitle(current))}</strong><span>${escapeHtml(trackArtist(current))}${state.currentFile ? ` · ${escapeHtml(state.currentFile.label)}` : ''}</span></div>` : '<div class="now-playing-placeholder">Choose a recording to start listening</div>'}
                </div>
                <div class="controls">
                    <div class="transport"><button class="icon-button" data-action="previous" aria-label="Previous track" title="Previous track">|&lt;</button><button class="play-button" data-action="toggle-play" aria-label="${audio.paused ? 'Play' : 'Pause'}" title="${audio.paused ? 'Play' : 'Pause'}">${audio.paused ? 'Play' : 'Pause'}</button><button class="icon-button" data-action="next" aria-label="Next track" title="Next track">&gt;|</button></div>
                    <div class="timeline"><span id="current-time">${formatTime(audio.currentTime)}</span><input id="seek-range" type="range" min="0" max="0" value="0" step="0.1" aria-label="Seek" /><span id="duration">${formatTime(audio.duration)}</span></div>
                </div>
                <label class="volume"><span aria-hidden="true">Vol</span><input id="volume-range" type="range" min="0" max="1" value="0.8" step="0.01" aria-label="Volume" /></label>
            </footer>
        </div>
    `;
    bindEvents();
}

function setStatus(message, error = false) {
    state.status = message;
    state.statusError = error;
    const status = document.getElementById('browse-status');
    if (status) {
        status.textContent = message;
        status.classList.toggle('error', error);
    }
}

async function search(query = '') {
    state.loading = true;
    state.query = query.trim();
    state.status = '';
    state.statusError = false;
    render();
    const searchQuery = state.query
        ? `${MUSIC_QUERY} AND (${state.query})`
        : DEFAULT_QUERY;
    const params = new URLSearchParams({
        q: searchQuery,
        fl: 'identifier,title,creator,description,licenseurl',
        rows: PAGE_SIZE,
        page: '1',
        output: 'json',
    });

    try {
        const response = await fetch(`${SEARCH_ENDPOINT}?${params}`);
        if (!response.ok) throw new Error(`Search failed (${response.status})`);
        const data = await response.json();
        state.tracks = (data.response?.docs || []).filter((track) => track.identifier);
        if (!state.tracks.length) {
            state.status = 'No recordings found. Try a broader search.';
            state.statusError = true;
        }
    } catch (error) {
        state.tracks = [];
        state.status = 'The free audio catalog is unavailable right now. Please try again.';
        state.statusError = true;
        console.error(error);
    } finally {
        state.loading = false;
        render();
    }
}

function chooseFile(files) {
    const candidates = files
        .filter((file) => !file.private && file.name && /\.(flac|ogg|oga|mp3|m4a|aac|wav)$/i.test(file.name))
        .map((file) => ({
            file,
            rank: /\.flac$/i.test(file.name)
                ? 0
                : /\.(ogg|oga)$/i.test(file.name)
                  ? 1
                  : /\.wav$/i.test(file.name)
                    ? 2
                    : 3,
        }))
        .sort((a, b) => a.rank - b.rank);

    for (const candidate of candidates) {
        const extension = candidate.file.name.split('.').pop().toLowerCase();
        const mime = {
            flac: 'audio/flac',
            ogg: 'audio/ogg',
            oga: 'audio/ogg',
            mp3: 'audio/mpeg',
            m4a: 'audio/mp4',
            aac: 'audio/aac',
            wav: 'audio/wav',
        }[extension];
        if (!mime || !audio.canPlayType(mime)) continue;
        return { file: candidate.file, mime };
    }
    return null;
}

function fileUrl(identifier, fileName) {
    return `https://archive.org/download/${encodeURIComponent(identifier)}/${fileName.split('/').map(encodeURIComponent).join('/')}`;
}

async function loadTrack(track) {
    setStatus(`Preparing "${trackTitle(track)}"...`);
    const response = await fetch(`${METADATA_ENDPOINT}${encodeURIComponent(track.identifier)}`);
    if (!response.ok) throw new Error(`Track metadata failed (${response.status})`);
    const metadata = await response.json();
    const selected = chooseFile(metadata.files || []);
    if (!selected) throw new Error('No browser-compatible audio file was found for this recording.');
    return {
        ...selected,
        url: fileUrl(track.identifier, selected.file.name),
        label: selected.file.name.split('.').pop().toUpperCase(),
    };
}

async function playQueueIndex(index) {
    const track = state.queue[index];
    if (!track) return;
    state.currentIndex = index;
    state.currentFile = null;
    render();
    try {
        state.currentFile = await loadTrack(track);
        audio.src = state.currentFile.url;
        audio.load();
        await audio.play();
        render();
        setStatus('');
    } catch (error) {
        setStatus(error.message || 'Unable to play this recording.', true);
        console.error(error);
    }
}

function addToQueue(track, playNow = false) {
    state.queue.push(track);
    const newIndex = state.queue.length - 1;
    if (playNow || state.currentIndex === -1) void playQueueIndex(newIndex);
    else render();
}

function bindEvents() {
    document.getElementById('search-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get('query');
        void search(typeof value === 'string' ? value : '');
    });
    document.querySelectorAll('[data-action]').forEach((element) => {
        element.addEventListener('click', () => {
            const action = element.dataset.action;
            if (action === 'play-track') addToQueue(state.tracks[Number(element.dataset.trackIndex)], true);
            if (action === 'queue-track') addToQueue(state.tracks[Number(element.dataset.trackIndex)]);
            if (action === 'play-queue-item') void playQueueIndex(Number(element.dataset.queueIndex));
            if (action === 'toggle-play') audio.paused ? audio.play().catch(() => {}) : audio.pause();
            if (action === 'previous' && state.currentIndex > 0) void playQueueIndex(state.currentIndex - 1);
            if (action === 'next' && state.currentIndex < state.queue.length - 1)
                void playQueueIndex(state.currentIndex + 1);
            if (action === 'clear-queue') {
                state.queue = [];
                state.currentIndex = -1;
                state.currentFile = null;
                audio.pause();
                audio.removeAttribute('src');
                render();
            }
        });
    });
    document.getElementById('seek-range')?.addEventListener('input', (event) => {
        audio.currentTime = Number(event.target.value);
    });
    document.getElementById('volume-range')?.addEventListener('input', (event) => {
        audio.volume = Number(event.target.value);
    });
}

audio.volume = 0.8;
for (const eventName of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'ended']) {
    audio.addEventListener(eventName, () => {
        const seek = document.getElementById('seek-range');
        const current = document.getElementById('current-time');
        const duration = document.getElementById('duration');
        if (seek) {
            seek.max = Number.isFinite(audio.duration) ? audio.duration : 0;
            seek.value = audio.currentTime;
        }
        if (current) current.textContent = formatTime(audio.currentTime);
        if (duration) duration.textContent = formatTime(audio.duration);
        if (eventName === 'ended' && state.currentIndex < state.queue.length - 1)
            void playQueueIndex(state.currentIndex + 1);
        if (eventName === 'play' || eventName === 'pause') render();
    });
}

document.documentElement.classList.add('simple-player');
document.addEventListener('DOMContentLoaded', () => {
    document.title = 'SongsPlay';
    document.body.replaceChildren(appRoot, audio);
    render();
    void search();
});
