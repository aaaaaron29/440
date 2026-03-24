# Changelog

## v3.1.0 — 2026-03-24

### Spotify Integration Fixes
- **Fixed playlist creation** — Spotify Development mode blocks `/v1/users/{id}/playlists`; switched to `/v1/me/playlists` endpoint
- **Fixed redirect URI** — Spotify no longer allows `localhost`; updated default to `http://127.0.0.1:5000/api/spotify/callback`
- **Added `show_dialog=True`** to force re-consent screen when reconnecting, ensuring fresh scopes
- **Added python-dotenv** — Spotify credentials now loaded from `.env` file (gitignored)

### New Features
- **Audio preview** — Recommendation cards show a play button for 30-second Spotify previews when available. Single audio player, one track at a time.
- **Liked tracks section** — Collapsible panel on the Discover page showing all tracks you've liked, with artist name, date, and preview button
- **Liked tracks API** — New `GET /api/recommendations/liked` endpoint returning liked track history with metadata

### Bug Fixes
- **Fixed recommendation stats** — Liked count and Like Rate were always showing 0. Root cause: stats queried `Recommendation.feedback` field which was never updated. Now correctly queries `RecommendationFeedback` table.
- **Fixed feedback tracking** — Frontend now sends `recommendation_id` with feedback calls so both `Recommendation.feedback` and `RecommendationFeedback` records are updated
- **Preview URLs stored** — `spotify_preview_url` column added to Track model; populated during Spotify search matching

### UI Changes
- Moved "Connect Spotify" section to top of Discover page (before the recommendation wizard) for better visibility
- Stats panel now shows real-time liked/disliked/skipped counts from feedback history

### Known Issues
- Spotify `/v1/tracks` batch endpoint returns 403 in Development mode — popularity is populated via search results during track matching instead
- Tracks matched before this update may lack popularity data; new matches will include it

---

## v3.0.0 — 2026-03-24

### Spotify Integration
- Real Spotify API integration via `spotipy` library
- OAuth Authorization Code flow for user authentication
- Direct playlist creation from recommendation results
- Track matching via Spotify search (background job, every 5 min)
- Popularity data fetching for niche/mainstream filtering
- Spotify popularity-based filtering replaces local scrobble count heuristic

### Recommendation Engine
- Popularity filter now uses Spotify's 0-100 popularity score
- Niche: popularity < 40, Mainstream: popularity > 50, Balanced: no filter
- Falls back to local play count if Spotify data unavailable

---

## v1.0.0 — 2026-03-24

### Initial Release
- Last.fm scrobble history tracking with automatic background sync
- Dashboard with listening statistics, top artists/tracks, streaks
- Recommendation engine with comfort zone and branch out modes
- Tag-based similarity, co-listening patterns, similar artist network
- 5-step discovery wizard UI
- Data export (JSON, CSV)
