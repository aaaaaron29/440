/**
 * Discover Page JavaScript
 * Handles the recommendation wizard flow and API interactions.
 */

// State management
const state = {
    currentStep: 1,
    timePeriod: 'month',
    selectedArtists: [],
    mode: 'comfort_zone',
    popularity: 'balanced',
    recommendations: [],
    sessionId: null,
    likedTracks: new Set(),
    spotifyAuthenticated: false,
    currentPreviewUrl: null
};

// DOM Elements
const elements = {
    steps: document.querySelectorAll('.wizard-step'),
    panels: document.querySelectorAll('.wizard-panel'),
    periodButtons: document.querySelectorAll('.period-btn'),
    modeCards: document.querySelectorAll('.mode-card'),
    popularitySlider: document.getElementById('popularity-slider'),
    popularityValue: document.getElementById('popularity-value'),
    artistGrid: document.getElementById('artist-grid'),
    recommendationGrid: document.getElementById('recommendation-grid'),
    loadingOverlay: document.getElementById('loading-overlay')
};

// Popularity labels
const popularityLabels = ['mainstream', 'balanced', 'niche'];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadStats();
    loadTopArtists();
    checkSpotifyStatus();
    loadLikedTracks();
});

function initializeEventListeners() {
    // Time period selection
    elements.periodButtons.forEach(btn => {
        btn.addEventListener('click', () => selectPeriod(btn));
    });

    // Mode selection
    elements.modeCards.forEach(card => {
        card.addEventListener('click', () => selectMode(card));
    });

    // Popularity slider
    elements.popularitySlider.addEventListener('input', updatePopularity);

    // Navigation buttons
    document.getElementById('btn-next-1').addEventListener('click', () => goToStep(2));
    document.getElementById('btn-back-2').addEventListener('click', () => goToStep(1));
    document.getElementById('btn-next-2').addEventListener('click', () => goToStep(3));
    document.getElementById('btn-back-3').addEventListener('click', () => goToStep(2));
    document.getElementById('btn-next-3').addEventListener('click', () => goToStep(4));
    document.getElementById('btn-back-4').addEventListener('click', () => goToStep(3));

    // Generate button
    document.getElementById('btn-generate').addEventListener('click', generateRecommendations);

    // Results actions
    document.getElementById('btn-start-over').addEventListener('click', startOver);
    document.getElementById('btn-export-json').addEventListener('click', exportJSON);
    document.getElementById('btn-create-playlist').addEventListener('click', createPlaylist);
    document.getElementById('btn-add-liked').addEventListener('click', addLikedToPlaylist);
}

// Load recommendation stats
async function loadStats() {
    try {
        const response = await fetch('/api/recommendations/stats');
        const data = await response.json();

        document.getElementById('stat-generated').textContent = data.total_generated || 0;
        document.getElementById('stat-liked').textContent = data.likes || 0;
        document.getElementById('stat-like-rate').textContent = `${data.like_rate || 0}%`;

        const bestMode = data.top_performing_mode || '-';
        document.getElementById('stat-best-mode').textContent =
            bestMode === 'comfort_zone' ? 'Comfort' :
            bestMode === 'branch_out' ? 'Branch Out' : '-';
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Load top artists for selection
async function loadTopArtists() {
    try {
        const period = state.timePeriod;
        const response = await fetch(`/api/top/artists?period=${period}&limit=20`);
        const data = await response.json();

        renderArtistGrid(data.artists);
    } catch (error) {
        console.error('Failed to load artists:', error);
        elements.artistGrid.innerHTML = '<p class="error">Failed to load artists</p>';
    }
}

function renderArtistGrid(artists) {
    if (!artists || artists.length === 0) {
        elements.artistGrid.innerHTML = '<p>No artists found for this period. Try a longer time range.</p>';
        return;
    }

    elements.artistGrid.innerHTML = artists.map(artist => `
        <label>
            <input type="checkbox" class="artist-checkbox" value="${artist.id}" data-name="${artist.name}">
            <div class="artist-card">
                <img src="${artist.image_url || '/static/img/default-artist.png'}"
                     alt="${artist.name}"
                     onerror="this.src='/static/img/default-artist.png'">
                <div class="artist-name">${artist.name}</div>
                <div class="play-count">${artist.play_count} plays</div>
            </div>
        </label>
    `).join('');

    // Add event listeners to checkboxes
    elements.artistGrid.querySelectorAll('.artist-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateSelectedArtists);
    });
}

function updateSelectedArtists() {
    state.selectedArtists = Array.from(
        elements.artistGrid.querySelectorAll('.artist-checkbox:checked')
    ).map(cb => parseInt(cb.value));
}

// Period selection
function selectPeriod(btn) {
    elements.periodButtons.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.timePeriod = btn.dataset.period;

    // Reload artists for new period
    loadTopArtists();
}

// Mode selection
function selectMode(card) {
    elements.modeCards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.mode = card.dataset.mode;
}

// Popularity slider
function updatePopularity() {
    const value = parseInt(elements.popularitySlider.value);
    state.popularity = popularityLabels[value];
    elements.popularityValue.textContent =
        state.popularity.charAt(0).toUpperCase() + state.popularity.slice(1);
}

// Step navigation
function goToStep(step) {
    // Update step indicators
    elements.steps.forEach(s => {
        const stepNum = parseInt(s.dataset.step);
        s.classList.remove('active', 'completed');
        if (stepNum < step) {
            s.classList.add('completed');
        } else if (stepNum === step) {
            s.classList.add('active');
        }
    });

    // Show correct panel
    elements.panels.forEach(p => p.classList.remove('active'));
    document.getElementById(`step-${step}`).classList.add('active');

    state.currentStep = step;
}

// Generate recommendations
async function generateRecommendations() {
    showLoading(true);

    try {
        const response = await fetch('/api/recommendations/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                time_period: state.timePeriod,
                selected_artists: state.selectedArtists.length > 0 ? state.selectedArtists : null,
                mode: state.mode,
                popularity: state.popularity
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        state.recommendations = data.recommendations || [];
        state.sessionId = data.session_id;
        state.likedTracks.clear();

        renderRecommendations();
        goToStep(5);
        loadStats(); // Refresh stats
    } catch (error) {
        console.error('Failed to generate recommendations:', error);
        alert('Failed to generate recommendations: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function renderRecommendations() {
    if (!state.recommendations || state.recommendations.length === 0) {
        elements.recommendationGrid.innerHTML = `
            <div class="empty-state">
                <p>No recommendations found. Try adjusting your settings or collecting more listening data.</p>
            </div>
        `;
        return;
    }

    elements.recommendationGrid.innerHTML = state.recommendations.map((rec, index) => `
        <div class="recommendation-card" data-track-id="${rec.track_id}" data-rec-id="${rec.recommendation_id || ''}" data-index="${index}">
            <img src="${rec.album_image_url || '/static/img/default-album.png'}"
                 alt="${rec.album_name || 'Album'}"
                 onerror="this.src='/static/img/default-album.png'">
            <div class="recommendation-info">
                <div class="track-name">${rec.track_name}</div>
                <div class="artist-name">${rec.artist_name}</div>
                <div class="reason">${rec.reason}</div>
            </div>
            ${rec.preview_url ? `<button class="feedback-btn preview-btn" onclick="togglePreview('${rec.preview_url}', this)" title="Preview">&#9654;</button>` : ''}
            <span class="score-badge">${Math.round(rec.score * 100)}%</span>
            <div class="feedback-buttons">
                <button class="feedback-btn like-btn" onclick="recordFeedback(${rec.track_id}, 'like', this, ${rec.recommendation_id || 'null'})" title="Like">
                    &#128077;
                </button>
                <button class="feedback-btn dislike-btn" onclick="recordFeedback(${rec.track_id}, 'dislike', this, ${rec.recommendation_id || 'null'})" title="Dislike">
                    &#128078;
                </button>
            </div>
        </div>
    `).join('');
}

// Record feedback
async function recordFeedback(trackId, feedbackType, button, recommendationId) {
    try {
        const body = {
            track_id: trackId,
            feedback_type: feedbackType
        };
        if (recommendationId) {
            body.recommendation_id = recommendationId;
        }

        const response = await fetch('/api/recommendations/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.success) {
            // Update button styles
            const card = button.closest('.recommendation-card');
            const likeBtn = card.querySelector('.like-btn');
            const dislikeBtn = card.querySelector('.dislike-btn');

            likeBtn.classList.remove('liked');
            dislikeBtn.classList.remove('disliked');

            if (feedbackType === 'like') {
                likeBtn.classList.add('liked');
                state.likedTracks.add(trackId);
            } else if (feedbackType === 'dislike') {
                dislikeBtn.classList.add('disliked');
                state.likedTracks.delete(trackId);
            }

            // Update stats and liked tracks
            loadStats();
            loadLikedTracks();
        }
    } catch (error) {
        console.error('Failed to record feedback:', error);
    }
}

// Export functions
function exportJSON() {
    const exportData = {
        generated_at: new Date().toISOString(),
        mode: state.mode,
        time_period: state.timePeriod,
        popularity: state.popularity,
        recommendations: state.recommendations.map(rec => ({
            track_name: rec.track_name,
            artist_name: rec.artist_name,
            album_name: rec.album_name,
            score: rec.score,
            reason: rec.reason,
            spotify_uri: rec.spotify_uri,
            lastfm_url: rec.lastfm_url
        }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recommendations_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function createPlaylist() {
    const trackIds = state.recommendations.map(r => r.track_id);

    try {
        showLoading(true);
        const response = await fetch('/api/spotify/create-playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track_ids: trackIds,
                playlist_name: `Discovery ${new Date().toLocaleDateString()}`
            })
        });

        const data = await response.json();

        if (data.playlist_url) {
            // Real Spotify playlist created
            window.open(data.playlist_url, '_blank');
            let msg = `Playlist created with ${data.tracks_added} tracks!`;
            if (data.tracks_unmatched > 0) {
                msg += ` (${data.tracks_unmatched} tracks couldn't be found on Spotify)`;
            }
            alert(msg);
        } else if (data.mock) {
            showPlaylistExport(data);
        } else if (data.error) {
            alert(data.error);
        }
    } catch (error) {
        console.error('Failed to create playlist:', error);
        alert('Failed to create playlist');
    } finally {
        showLoading(false);
    }
}

function showPlaylistExport(data) {
    // Create a simple text export for manual playlist creation
    const trackList = data.tracks.map(t => `${t.name} - ${t.artist}`).join('\n');

    const message = `Spotify integration is pending.\n\nTo create your playlist manually:\n${data.instructions.join('\n')}\n\nTracks:\n${trackList}`;

    // Create downloadable text file
    const blob = new Blob([trackList], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `playlist_tracks.txt`;
    a.click();
    URL.revokeObjectURL(url);

    alert('Track list downloaded! Open Spotify and search for each track to add to your playlist.');
}

async function addLikedToPlaylist() {
    if (state.likedTracks.size === 0) {
        alert('No liked tracks to add. Like some tracks first!');
        return;
    }

    const trackIds = Array.from(state.likedTracks);

    try {
        showLoading(true);
        const response = await fetch('/api/spotify/create-playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track_ids: trackIds,
                playlist_name: `Liked Discoveries ${new Date().toLocaleDateString()}`
            })
        });

        const data = await response.json();

        if (data.playlist_url) {
            window.open(data.playlist_url, '_blank');
            let msg = `Playlist created with ${data.tracks_added} tracks!`;
            if (data.tracks_unmatched > 0) {
                msg += ` (${data.tracks_unmatched} tracks couldn't be found on Spotify)`;
            }
            alert(msg);
        } else if (data.mock) {
            showPlaylistExport(data);
        } else if (data.error) {
            alert(data.error);
        }
    } catch (error) {
        console.error('Failed to create playlist:', error);
        alert('Failed to create playlist');
    } finally {
        showLoading(false);
    }
}

// Start over
function startOver() {
    state.currentStep = 1;
    state.selectedArtists = [];
    state.recommendations = [];
    state.sessionId = null;
    state.likedTracks.clear();

    // Reset UI
    elements.periodButtons.forEach(b => {
        b.classList.toggle('selected', b.dataset.period === 'month');
    });
    state.timePeriod = 'month';

    elements.modeCards.forEach(c => {
        c.classList.toggle('selected', c.dataset.mode === 'comfort_zone');
    });
    state.mode = 'comfort_zone';

    elements.popularitySlider.value = 1;
    state.popularity = 'balanced';
    elements.popularityValue.textContent = 'Balanced';

    // Uncheck all artists
    elements.artistGrid.querySelectorAll('.artist-checkbox').forEach(cb => {
        cb.checked = false;
    });

    goToStep(1);
    loadTopArtists();
}

// Loading overlay
function showLoading(show) {
    elements.loadingOverlay.classList.toggle('active', show);
}

// Spotify integration
async function checkSpotifyStatus() {
    try {
        const response = await fetch('/api/spotify/status');
        const data = await response.json();

        state.spotifyAuthenticated = data.authenticated;

        const noticeText = document.getElementById('spotify-notice-text');
        const connectBtn = document.getElementById('btn-connect-spotify');
        const disconnectBtn = document.getElementById('btn-disconnect-spotify');

        if (data.authenticated) {
            noticeText.innerHTML = '<h4>Spotify Connected</h4><p>Playlists will be created directly in your Spotify account.</p>';
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'inline-block';
            disconnectBtn.onclick = disconnectSpotify;
        } else if (data.enabled) {
            noticeText.innerHTML = '<h4>Connect Your Spotify Account</h4><p>Connect to create playlists directly in Spotify.</p>';
            connectBtn.style.display = 'inline-block';
            connectBtn.onclick = connectSpotify;
            disconnectBtn.style.display = 'none';
        } else {
            noticeText.innerHTML = '<h4>Spotify Not Configured</h4><p>Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to enable Spotify integration.</p>';
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to check Spotify status:', error);
    }
}

async function connectSpotify() {
    try {
        const response = await fetch('/api/spotify/authenticate');
        const data = await response.json();

        if (data.auth_url) {
            window.location.href = data.auth_url;
        } else if (data.error) {
            alert(data.error);
        }
    } catch (error) {
        console.error('Failed to start Spotify auth:', error);
    }
}

async function disconnectSpotify() {
    try {
        const response = await fetch('/api/spotify/disconnect', { method: 'POST' });
        const data = await response.json();
        if (data.status === 'disconnected') {
            checkSpotifyStatus();
        }
    } catch (error) {
        console.error('Failed to disconnect Spotify:', error);
    }
}

// Audio preview
function togglePreview(url, button) {
    const player = document.getElementById('preview-player');

    // Reset all preview buttons
    document.querySelectorAll('.preview-btn.playing').forEach(btn => {
        if (btn !== button) btn.classList.remove('playing');
    });

    if (state.currentPreviewUrl === url && !player.paused) {
        // Same track, pause it
        player.pause();
        button.classList.remove('playing');
        state.currentPreviewUrl = null;
    } else {
        // New track or resume
        player.src = url;
        player.play();
        button.classList.add('playing');
        state.currentPreviewUrl = url;

        player.onended = () => {
            button.classList.remove('playing');
            state.currentPreviewUrl = null;
        };
    }
}

// Liked tracks section
async function loadLikedTracks() {
    try {
        const response = await fetch('/api/recommendations/liked?limit=50');
        const data = await response.json();

        const countEl = document.getElementById('liked-count');
        const listEl = document.getElementById('liked-list');

        countEl.textContent = data.total || 0;

        if (!data.liked_tracks || data.liked_tracks.length === 0) {
            listEl.innerHTML = '<p style="color: var(--color-text-muted); font-size: 0.875rem;">No liked tracks yet. Like some recommendations to see them here.</p>';
            return;
        }

        listEl.innerHTML = data.liked_tracks.map(track => `
            <div class="liked-item">
                <img src="${track.album_image_url || '/static/img/default-album.png'}"
                     alt="${track.album_name || 'Album'}"
                     onerror="this.src='/static/img/default-album.png'">
                <div class="liked-item-info">
                    <div class="track-name">${track.track_name}</div>
                    <div class="artist-name">${track.artist_name}</div>
                </div>
                ${track.preview_url ? `<button class="feedback-btn preview-btn" onclick="togglePreview('${track.preview_url}', this)" title="Preview">&#9654;</button>` : ''}
                <span class="liked-date">${track.liked_at ? new Date(track.liked_at).toLocaleDateString() : ''}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load liked tracks:', error);
    }
}

function toggleLikedSection() {
    document.getElementById('liked-section').classList.toggle('expanded');
}

// Make functions available globally
window.recordFeedback = recordFeedback;
window.togglePreview = togglePreview;
window.toggleLikedSection = toggleLikedSection;
