/**
 * ZenFeed - Minimalist Video Aggregator
 * @license MIT
 * @author Len Kadner
 * 
 * Copyright (c) 2026 Len Kadner
 */

(function () {
    "use strict";

    // --- 1. CONFIGURATION & INFRASTRUCTURE ---
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
        REQUEST_TIMEOUT: 8000
    };

    // --- 2. GLOBAL STATE ---
    let state = {
        channels: JSON.parse(localStorage.getItem("zf_channels")) || [],
        stats: JSON.parse(localStorage.getItem("zf_stats")) || {},
        isSearching: false,
        cache: new Map()
    };

    // --- 3. CORE UTILITIES ---
    const Utils = {
        save: () => {
            localStorage.setItem("zf_channels", JSON.stringify(state.channels));
            localStorage.setItem("zf_stats", JSON.stringify(state.stats));
        },

        escape: (str) => {
            if (!str) return "";
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        normalizeVideo: (raw) => {
            if (raw.url && raw.url.includes('v=')) {
                return {
                    id: raw.url.split('v=')[1].split('&')[0],
                    title: raw.title || "Unknown Title",
                    author: raw.uploaderName || raw.author || "Unknown Creator",
                    date: raw.uploadedDate || ""
                };
            }
            if (raw.videoId) {
                return {
                    id: raw.videoId,
                    title: raw.title || "Unknown Title",
                    author: raw.author || "Unknown Creator",
                    date: raw.publishedText || ""
                };
            }
            return {
                id: raw.id || "",
                title: raw.title || "Unknown Title",
                author: raw.author || "Unknown Creator",
                date: raw.published ? new Date(raw.published).toLocaleDateString() : ""
            };
        }
    };

    // --- 4. NETWORK ENGINE ---
    async function fetchWithRetry(endpoints, type = 'piped') {
        const nodes = type === 'piped' ? [...CONFIG.PIPED_NODES] : [...CONFIG.INVIDIOUS_NODES];
        const shuffled = nodes.sort(() => Math.random() - 0.5);

        for (const node of shuffled) {
            try {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

                const response = await fetch(`${node}${endpoints}`, { signal: controller.signal });
                clearTimeout(id);

                if (response.ok) {
                    const data = await response.json();
                    if (data) return data;
                }
            } catch (e) {
                console.warn(`Node ${node} failed, trying next...`);
            }
        }
        throw new Error("All nodes failed.");
    }

    async function fetchRSS(channelId) {
        const ytUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        for (const proxy of CONFIG.PROXIES) {
            try {
                const res = await fetch(`${proxy}${encodeURIComponent(ytUrl)}`);
                if (!res.ok) continue;
                const text = await res.text();
                const xml = new DOMParser().parseFromString(text, "text/xml");
                const entries = Array.from(xml.querySelectorAll("entry")).slice(0, 5);

                return entries.map(e => ({
                    id: e.querySelector("videoId")?.textContent,
                    title: e.querySelector("title")?.textContent,
                    author: e.querySelector("author name")?.textContent,
                    published: e.querySelector("published")?.textContent
                }));
            } catch (e) { continue; }
        }
        return [];
    }

    // --- 5. UI COMPONENTS ---
    const UI = {
        showLoading: (containerId, msg) => {
            const el = document.getElementById(containerId);
            if (el) el.innerHTML = `<div class="loader-container"><div class="spinner"></div><p>${msg}</p></div>`;
        },

        renderVideoCard: (v) => {
            const data = Utils.normalizeVideo(v);
            if (!data.id) return "";

            return `
                <article class="video-card" data-id="${data.id}">
                    <div class="video-container">
                        <div class="video-thumb" onclick="playVideo('${data.id}', '${Utils.escape(data.author)}')">
                            <img src="https://img.youtube.com/vi/${data.id}/hqdefault.jpg" 
                                 alt="${Utils.escape(data.title)}" 
                                 loading="lazy"
                                 onerror="this.src='https://via.placeholder.com/640x360?text=Video+Thumbnail'">
                            <div class="play-overlay"><i data-lucide="play"></i></div>
                        </div>
                    </div>
                    <div class="video-content">
                        <h3 title="${Utils.escape(data.title)}">${Utils.escape(data.title)}</h3>
                        <div class="video-info">
                            <span class="author">${Utils.escape(data.author)}</span>
                            <span class="date">${data.date}</span>
                        </div>
                    </div>
                </article>
            `;
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
                </div>
            `;
        }
    };

    // --- 6. CORE ACTIONS ---
    async function loadJournal() {
        const grid = document.getElementById('video-grid');
        if (!grid) return;

        if (state.channels.length === 0) {
            grid.innerHTML = `<div class="empty-state"><h3>Circle is empty</h3><p>Add creators in Curation.</p></div>`;
            return;
        }

        UI.showLoading('video-grid', 'Fetching latest Focus...');

        try {
            const allResults = [];

            // LÖSUNG: Sequenzielle Abfrage statt Promise.all()
            for (const c of state.channels) {
                const feed = await fetchRSS(c.id);
                allResults.push(feed);

                // Pro-Tipp: 300ms Pause zwischen den Requests, um 429 (Too Many Requests) bei den Proxies zu vermeiden
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            const flatVideos = allResults.flat()
                .filter(v => v && v.id)
                .sort((a, b) => new Date(b.published) - new Date(a.published));

            if (flatVideos.length === 0) {
                grid.innerHTML = `<div class="empty-state"><h3>No recent videos</h3></div>`;
                return;
            }

            grid.innerHTML = flatVideos.map(v => UI.renderVideoCard(v)).join("");
            if (typeof lucide !== 'undefined') lucide.createIcons(); // Sicherheitscheck für lucide
        } catch (err) {
            console.error("Feed error:", err);
            grid.innerHTML = `<div class="error-msg">Sync failed. Try refreshing.</div>`;
        }
    }

    async function searchVideos() {
        const input = document.getElementById('global-search');
        const query = input ? input.value.trim() : "";
        if (!query) return;

        UI.showLoading('search-results-grid', `Searching for "${query}"...`);

        try {
            let data;
            try {
                data = await fetchWithRetry(`/search?q=${encodeURIComponent(query)}&filter=videos`, 'piped');
            } catch (e) {
                data = await fetchWithRetry(`/api/v1/search?q=${encodeURIComponent(query)}&type=video`, 'invidious');
            }

            const items = data.items || data;
            const grid = document.getElementById('search-results-grid');

            if (!items || items.length === 0) {
                grid.innerHTML = `<div class="empty-state">No results found.</div>`;
            } else {
                grid.innerHTML = items.slice(0, 30).map(v => UI.renderVideoCard(v)).join("");
                lucide.createIcons();
            }
        } catch (err) {
            document.getElementById('search-results-grid').innerHTML = `<div class="error-msg">Service offline.</div>`;
        }
    }

    async function searchChannels() {
        const input = document.getElementById('channel-search');
        const query = input ? input.value.trim() : "";
        if (!query) return;

        UI.showLoading('search-results', 'Locating Creators...');

        try {
            let data;
            try {
                data = await fetchWithRetry(`/search?q=${encodeURIComponent(query)}&filter=channels`, 'piped');
            } catch (e) {
                data = await fetchWithRetry(`/api/v1/search?q=${encodeURIComponent(query)}&type=channel`, 'invidious');
            }

            const items = data.items || data;
            const container = document.getElementById('search-results');
            container.innerHTML = items.slice(0, 12).map(c => UI.renderChannelRow(c)).join("");
            lucide.createIcons();
        } catch (err) {
            document.getElementById('search-results').innerHTML = `<div class="error-msg">Error searching channels.</div>`;
        }
    }

    // --- 7. GLOBAL PLAYER ---
    window.playVideo = (id, author) => {
        state.stats[author] = (state.stats[author] || 0) + 1;
        Utils.save();

        const container = document.querySelector(`.video-card[data-id="${id}"] .video-container`);
        if (container) {
            container.innerHTML = `
                <iframe class="inline-player"
                    src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1" 
                    frameborder="0" 
                    allow="autoplay; encrypted-media" 
                    allowfullscreen>
                </iframe>
            `;
        }
    };

    // --- 8. STATE ACTIONS ---
    window.toggleChannel = (id, title) => {
        const index = state.channels.findIndex(c => c.id === id);
        if (index > -1) {
            state.channels.splice(index, 1);
        } else {
            state.channels.push({ id, title });
        }
        Utils.save();
        renderCurationList();

        const buttons = document.querySelectorAll(`button[onclick*="${id}"]`);
        buttons.forEach(btn => {
            const isSubbed = index === -1;
            btn.classList.toggle('active', isSubbed);
            btn.innerHTML = `<i data-lucide="${isSubbed ? 'minus' : 'plus'}"></i><span>${isSubbed ? 'Remove' : 'Add'}</span>`;
        });
        lucide.createIcons();
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
        lucide.createIcons();
    }

    function renderStats() {
        const total = Object.values(state.stats).reduce((a, b) => a + b, 0);
        const sorted = Object.entries(state.stats).sort((a, b) => b[1] - a[1]);

        const totalEl = document.getElementById('stat-total-plays');
        const topEl = document.getElementById('stat-top-channel');
        if (totalEl) totalEl.innerText = total;
        if (topEl) topEl.innerText = sorted[0] ? sorted[0][0] : "-";

        const list = document.getElementById('stats-list');
        if (list) {
            list.innerHTML = sorted.map(([name, count]) => `
                <div class="stat-item">
                    <strong>${Utils.escape(name)}</strong>
                    <span>${count} views</span>
                </div>
            `).join("");
        }
    }

    // --- 9. INITIALIZATION & MODERN EVENTS ---
    function setupNavigation() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.onclick = () => {
                const target = btn.getAttribute('data-target');
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                document.querySelectorAll('.view').forEach(v => {
                    v.classList.add('hidden');
                    v.classList.remove('active');
                });

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

        // Moderne Event-Listener für Global Search
        const globalSearchInput = document.getElementById('global-search');
        const globalSearchBtn = document.getElementById('btn-global-search');

        if (globalSearchBtn) globalSearchBtn.onclick = searchVideos;
        if (globalSearchInput) {
            globalSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') searchVideos();
            });
        }

        // Moderne Event-Listener für Channel Search
        const channelSearchInput = document.getElementById('channel-search');
        const channelSearchBtn = document.getElementById('btn-search');

        if (channelSearchBtn) channelSearchBtn.onclick = searchChannels;
        if (channelSearchInput) {
            channelSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') searchChannels();
            });
        }

        loadJournal();
        lucide.createIcons();
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
