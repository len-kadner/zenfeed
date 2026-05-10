/**
 * ZenFeed - Minimalist Video Aggregator
 * @license MIT
 * @author Len Kadner
 * 
 * Copyright (c) 2026 Len Kadner
 */

(function () {
    "use strict";

    // --- 1. CONFIGURATION ---
    const CONFIG = {
        PIPED_NODES: [
            "https://pipedapi.kavin.rocks",
            "https://pipedapi.drgns.space",
            "https://api.piped.projectsegfau.lt",
            "https://pipedapi.lunar.icu",
            "https://pipedapi.r4fo.com"
        ],
        INVIDIOUS_NODES: [
            "https://invidious.fdn.fr",
            "https://inv.nadeko.net",
            "https://iv.melmac.space",
            "https://invidious.v0l.me"
        ],
        PROXIES: [
            "https://api.allorigins.win/raw?url=",
            "https://corsproxy.io/?",
            "https://thingproxy.freeboard.io/fetch/"
        ],
        REQUEST_TIMEOUT: 6000,
        CACHE_KEY: "zf_cache_videos"
    };

    // --- 2. GLOBAL STATE ---
    let state = {
        channels: JSON.parse(localStorage.getItem("zf_channels")) || [],
        stats: JSON.parse(localStorage.getItem("zf_stats")) || {},
        cachedVideos: JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY)) || [],
        activeFilter: 'all',
        isSearching: false,
        loadId: 0
    };

    // --- 3. CORE UTILITIES ---
    const Utils = {
        save: () => {
            localStorage.setItem("zf_channels", JSON.stringify(state.channels));
            localStorage.setItem("zf_stats", JSON.stringify(state.stats));
            localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(state.cachedVideos));
        },

        escape: (str) => {
            if (!str) return "";
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        normalizeVideo: (raw) => {
            const id = raw.videoId || raw.id || (raw.url?.includes('v=') ? raw.url.split('v=')[1].split('&')[0] : "");
            const pubDate = raw.published ? new Date(raw.published) : new Date(0);
            return {
                id: id,
                title: raw.title || "Unknown Title",
                author: raw.author || raw.uploaderName || "Unknown Creator",
                date: pubDate.toLocaleDateString(),
                rawDate: pubDate.getTime(),
                channelId: raw.channelId || ""
            };
        }
    };

    // --- 4. NETWORK ENGINE ---
    async function fetchWithRetry(endpoint, type = 'piped') {
        const nodes = type === 'piped' ? [...CONFIG.PIPED_NODES] : [...CONFIG.INVIDIOUS_NODES];
        const shuffled = nodes.sort(() => Math.random() - 0.5);

        for (const node of shuffled) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
                const response = await fetch(`${node}${endpoint}`, { signal: controller.signal });
                clearTimeout(timeout);
                if (response.ok) return await response.json();
            } catch (e) { continue; }
        }
        throw new Error("API nodes exhausted");
    }

    async function fetchRSS(channelId) {
        const ytUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        for (const proxy of CONFIG.PROXIES) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
                const res = await fetch(`${proxy}${encodeURIComponent(ytUrl)}`, { signal: controller.signal });
                clearTimeout(timeout);
                if (!res.ok) continue;
                const text = await res.text();
                const xml = new DOMParser().parseFromString(text, "text/xml");
                const entries = Array.from(xml.getElementsByTagName("entry")).slice(0, 10);
                return entries.map(e => ({
                    id: e.getElementsByTagNameNS("*", "videoId")[0]?.textContent || e.querySelector("videoId")?.textContent || "",
                    title: e.getElementsByTagName("title")[0]?.textContent || "Unknown",
                    author: e.getElementsByTagName("name")[0]?.textContent || "Creator",
                    published: e.getElementsByTagName("published")[0]?.textContent,
                    channelId: channelId
                }));
            } catch (e) { continue; }
        }
        return [];
    }

    // --- 5. UI COMPONENTS ---
    const UI = {
        showInitialLoader: (containerId) => {
            const el = document.getElementById(containerId);
            if (el) {
                el.innerHTML = `
                <div class="initial-loader-wrap">
                    <div class="zen-spinner"></div>
                    <p class="loader-text">Harmonizing your feed...</p>
                </div>`;
            }
        },

        renderVideoCard: (v) => {
            const data = Utils.normalizeVideo(v);
            if (!data.id) return "";
            return `
                <article class="video-card" data-id="${data.id}">
                    <div class="video-container">
                        <div class="video-thumb" onclick="playVideo('${data.id}', '${Utils.escape(data.author)}')">
                            <img src="https://img.youtube.com/vi/${data.id}/mqdefault.jpg" 
                                 alt="${Utils.escape(data.title)}" loading="lazy"
                                 onerror="this.src='https://via.placeholder.com/480x270?text=Video+Unavailable'">
                            <div class="play-overlay"><i data-lucide="play"></i></div>
                        </div>
                    </div>
                    <div class="video-content">
                        <h3>${Utils.escape(data.title)}</h3>
                        <div class="video-info">
                            <span class="author">${Utils.escape(data.author)}</span>
                            <span class="date">${data.date}</span>
                        </div>
                    </div>
                </article>`;
        },

        renderChannelRow: (c) => {
            const channelId = c.url ? c.url.split("/channel/")[1] : (c.authorId || c.id);
            const isSubbed = state.channels.some(chan => chan.id === channelId);
            const name = c.name || c.author || c.title;
            return `
                <div class="channel-row">
                    <div class="channel-meta">
                        <div class="channel-avatar">${name.charAt(0).toUpperCase()}</div>
                        <div class="channel-text">
                            <strong>${Utils.escape(name)}</strong>
                            <p>${c.subscribers ? c.subscribers.toLocaleString() + ' Subs' : 'Creator'}</p>
                        </div>
                    </div>
                    <button class="btn-curate ${isSubbed ? 'active' : ''}" 
                            onclick="toggleChannel('${channelId}', '${Utils.escape(name)}')">
                        <i data-lucide="${isSubbed ? 'minus' : 'plus'}"></i>
                        <span>${isSubbed ? 'Remove' : 'Add'}</span>
                    </button>
                </div>`;
        },

        renderFilterBar: () => {
            const container = document.getElementById('channel-filters');
            if (!container) return;
            let html = `<button class="filter-btn ${state.activeFilter === 'all' ? 'active' : ''}" onclick="setFilter('all')">All Journal</button>`;
            state.channels.forEach(c => {
                html += `<button class="filter-btn ${state.activeFilter === c.id ? 'active' : ''}" onclick="setFilter('${c.id}')">${Utils.escape(c.title)}</button>`;
            });
            container.innerHTML = html;
        }
    };

    // --- 6. CORE ACTIONS ---
    window.setFilter = (id) => {
        state.activeFilter = id;
        loadJournal();
    };

    async function loadJournal() {
        const grid = document.getElementById('video-grid');
        if (!grid) return;

        UI.renderFilterBar();
        if (state.channels.length === 0) {
            grid.innerHTML = `<div class="empty-state"><h3>Circle is empty</h3><p>Add creators in Curation.</p></div>`;
            return;
        }

        const currentLoad = ++state.loadId;

        const isFirstStart = state.cachedVideos.length === 0;

        if (isFirstStart && state.activeFilter === 'all') {
            UI.showInitialLoader('video-grid');
        } else {
            let displayVideos = state.activeFilter === 'all'
                ? state.cachedVideos
                : state.cachedVideos.filter(v => v.channelId === state.activeFilter);

            if (displayVideos.length > 0) {
                grid.innerHTML = displayVideos
                    .sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0))
                    .map(v => UI.renderVideoCard(v)).join("");
                if (window.lucide) lucide.createIcons();
            } else {
                UI.showInitialLoader('video-grid');
            }
        }

        try {
            let freshVideos = [];
            if (state.activeFilter === 'all') {
                const results = await Promise.all(state.channels.map(c => fetchRSS(c.id)));
                freshVideos = results.flat();
            } else {
                freshVideos = await fetchRSS(state.activeFilter);
            }

            if (currentLoad !== state.loadId) return;


            if (state.activeFilter === 'all' && freshVideos.length > 0) {
                state.cachedVideos = freshVideos.map(v => ({
                    ...v,
                    rawDate: new Date(v.published).getTime()
                }));
                Utils.save();
            }

            const sorted = freshVideos
                .filter(v => v.id)
                .sort((a, b) => new Date(b.published) - new Date(a.published));

            if (sorted.length > 0) {
                grid.innerHTML = sorted.map(v => UI.renderVideoCard(v)).join("");
                if (window.lucide) lucide.createIcons();
            }
        } catch (err) {
            console.warn("Background sync throttled, showing cached content.");
        }
    }

    // --- 7. SEARCH FUNCTIONS ---
    async function searchVideos() {
        const query = document.getElementById('global-search')?.value.trim();
        if (!query) return;
        UI.showInitialLoader('search-results-grid');
        try {
            let data;
            try {
                data = await fetchWithRetry(`/search?q=${encodeURIComponent(query)}&filter=videos`, 'piped');
            } catch (e) {
                data = await fetchWithRetry(`/api/v1/search?q=${encodeURIComponent(query)}&type=video`, 'invidious');
            }
            const items = data.items || data || [];
            const grid = document.getElementById('search-results-grid');
            grid.innerHTML = items.length ? items.slice(0, 24).map(v => UI.renderVideoCard(v)).join("") : `<div class="empty-state">No results.</div>`;
            if (window.lucide) lucide.createIcons();
        } catch (err) {
            document.getElementById('search-results-grid').innerHTML = `<div class="error-msg">Search unavailable.</div>`;
        }
    }

    async function searchChannels() {
        const query = document.getElementById('channel-search')?.value.trim();
        if (!query) return;
        UI.showInitialLoader('search-results');
        try {
            let data;
            try {
                data = await fetchWithRetry(`/search?q=${encodeURIComponent(query)}&filter=channels`, 'piped');
            } catch (e) {
                data = await fetchWithRetry(`/api/v1/search?q=${encodeURIComponent(query)}&type=channel`, 'invidious');
            }
            const items = data.items || data || [];
            const container = document.getElementById('search-results');
            container.innerHTML = items.slice(0, 15).map(c => UI.renderChannelRow(c)).join("");
            if (window.lucide) lucide.createIcons();
        } catch (err) {
            document.getElementById('search-results').innerHTML = `<div class="error-msg">Search error.</div>`;
        }
    }

    // --- 8. GLOBAL PLAYER ---
    window.playVideo = (id, author) => {
        state.stats[author] = (state.stats[author] || 0) + 1;
        Utils.save();
        const container = document.querySelector(`.video-card[data-id="${id}"] .video-container`);
        if (container) {
            container.innerHTML = `<iframe class="inline-player" src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        }
    };

    // --- 9. STATE ACTIONS ---
    window.toggleChannel = (id, title) => {
        const index = state.channels.findIndex(c => c.id === id);
        if (index > -1) {
            state.channels.splice(index, 1);
            if (state.activeFilter === id) state.activeFilter = 'all';
        } else {
            state.channels.push({ id, title });
        }
        Utils.save();
        renderCurationList();
        UI.renderFilterBar();
        document.querySelectorAll(`button[onclick*="${id}"]`).forEach(btn => {
            const isSubbed = state.channels.some(c => c.id === id);
            btn.classList.toggle('active', isSubbed);
            btn.innerHTML = `<i data-lucide="${isSubbed ? 'minus' : 'plus'}"></i><span>${isSubbed ? 'Remove' : 'Add'}</span>`;
        });
        if (window.lucide) lucide.createIcons();
    };

    function renderCurationList() {
        const list = document.getElementById('channel-list');
        if (!list) return;
        list.innerHTML = state.channels.map(c => `
            <div class="chip">
                <span>${Utils.escape(c.title)}</span>
                <button onclick="toggleChannel('${c.id}', '')"><i data-lucide="x"></i></button>
            </div>
        `).join("");
        if (window.lucide) lucide.createIcons();
    }

    function renderStats() {
        const total = Object.values(state.stats).reduce((a, b) => a + b, 0);
        const sorted = Object.entries(state.stats).sort((a, b) => b[1] - a[1]);
        if (document.getElementById('stat-total-plays')) document.getElementById('stat-total-plays').innerText = total;
        if (document.getElementById('stat-top-channel')) document.getElementById('stat-top-channel').innerText = sorted[0] ? sorted[0][0] : "-";
        const list = document.getElementById('stats-list');
        if (list) {
            list.innerHTML = sorted.map(([name, count]) => `<div class="stat-item"><strong>${Utils.escape(name)}</strong><span>${count} views</span></div>`).join("");
        }
    }

    // --- 10. NAVIGATION & INIT ---
    function setupNavigation() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.onclick = () => {
                const target = btn.getAttribute('data-target');
                document.querySelectorAll('.nav-btn, .view').forEach(el => {
                    el.classList.remove('active');
                    if (el.classList.contains('view')) el.classList.add('hidden');
                });
                btn.classList.add('active');
                const activeView = document.getElementById(`view-${target}`);
                if (activeView) {
                    activeView.classList.remove('hidden');
                    activeView.classList.add('active');
                }
                if (target === 'feed') loadJournal();
                if (target === 'stats') renderStats();
                if (target === 'settings') renderCurationList();
            };
        });
    }

    function init() {
        setupNavigation();
        document.getElementById('btn-global-search')?.addEventListener('click', searchVideos);
        document.getElementById('global-search')?.addEventListener('keydown', e => e.key === 'Enter' && searchVideos());
        document.getElementById('btn-search')?.addEventListener('click', searchChannels);
        document.getElementById('channel-search')?.addEventListener('keydown', e => e.key === 'Enter' && searchChannels());
        loadJournal();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();