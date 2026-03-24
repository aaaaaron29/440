/u# Last.fm Listening History Tracker - Architecture Document

> **SOURCE OF TRUTH** - Reference this document before making any changes to ensure architectural consistency.

## Overview

A Python-based music listening history tracker that integrates with Last.fm and Spotify APIs to collect, store, and analyze listening data for recommendation system research. Includes real Spotify integration for playlist creation and track popularity data.

## Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Backend | Flask 2.x | Lightweight, Python-native, easy to extend |
| Database | SQLite | Portable, zero-config, single-file storage |
| Background Jobs | APScheduler | Pure Python, persistent job store, Flask integration |
| HTTP Client | requests | Simple, well-documented, industry standard |
| Spotify API | spotipy | OAuth, search, playlist creation, popularity data |
| Environment | python-dotenv | Secure credential management via .env |
| Frontend | Vanilla HTML/CSS/JS | No build step, simple deployment |

## Project Structure

```
lastfm-tracker/
├── claude.md              # This file - architecture documentation
├── README.md              # User-facing documentation
├── requirements.txt       # Python dependencies
├── config.py              # Configuration management
├── app.py                 # Flask application & API endpoints
├── models.py              # SQLAlchemy models & database schema
├── lastfm_client.py       # Last.fm API wrapper
├── sync_service.py        # Background sync orchestration
├── enhanced_sync_service.py # Extended data collection (tags, similar artists)
├── metrics.py             # Pre-computed metrics calculations
├── recommender.py         # Recommendation engine
├── spotify_client.py      # Spotify integration (real API via spotipy)
├── run_service.py         # Windows service runner
├── static/
│   ├── css/
│   │   └── style.css      # Last.fm-inspired theme
│   └── js/
│       ├── app.js         # Dashboard frontend logic
│       └── discover.js    # Recommendation wizard logic
└── templates/
    ├── index.html         # Dashboard template
    └── discover.html      # Recommendation discovery wizard
```

## Database Schema

### Entity Relationship Diagram (Conceptual)

```
Users (1) ──────< Scrobbles (N) >────── Tracks (1) ───< TrackTags (N)
  │                                        │
  │                                        │
  ├───< LovedTracks (N)                   │
  │                                        │
  ├───< UserMetrics (N)                   ▼
  │                                    Artists (1) ───< ArtistTags (N)
  │                                        │
  ├───< Recommendations (N)               ├───< SimilarArtists (N)
  │                                        │
  ├───< RecommendationFeedback (N)        ▼
  │                                    Albums (1)
  ├───< ListeningSessions (N)
  │
  └───< CoListeningPatterns (N)

Tracks (1) ──────< AudioFeatures (1)  [Spotify placeholder]
```

### Table Definitions

#### `users`
Primary user table. Single-user implementation now, multi-user ready.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal user ID |
| lastfm_username | TEXT | UNIQUE, NOT NULL | Last.fm username |
| api_key | TEXT | NOT NULL | Last.fm API key |
| created_at | DATETIME | NOT NULL | Account creation time |
| last_sync_at | DATETIME | NULLABLE | Last successful sync |
| total_scrobbles | INTEGER | DEFAULT 0 | Cached total count |
| sync_interval_minutes | INTEGER | DEFAULT 30 | Configurable sync interval |

**Index:** `idx_users_username` on `lastfm_username`

#### `artists`
Normalized artist data.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal artist ID |
| lastfm_mbid | TEXT | NULLABLE, INDEX | MusicBrainz ID from Last.fm |
| name | TEXT | NOT NULL | Artist name |
| url | TEXT | NULLABLE | Last.fm artist page URL |
| image_url | TEXT | NULLABLE | Artist image URL |
| created_at | DATETIME | NOT NULL | First seen timestamp |

**Index:** `idx_artists_mbid` on `lastfm_mbid`
**Index:** `idx_artists_name` on `name`

#### `albums`
Normalized album data.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal album ID |
| lastfm_mbid | TEXT | NULLABLE, INDEX | MusicBrainz ID |
| name | TEXT | NOT NULL | Album name |
| artist_id | INTEGER | FK → artists.id | Associated artist |
| image_url | TEXT | NULLABLE | Album art URL |
| created_at | DATETIME | NOT NULL | First seen timestamp |

**Index:** `idx_albums_mbid` on `lastfm_mbid`
**Index:** `idx_albums_artist` on `artist_id`

#### `tracks`
Normalized track data.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal track ID |
| lastfm_mbid | TEXT | NULLABLE, INDEX | MusicBrainz ID |
| name | TEXT | NOT NULL | Track name |
| artist_id | INTEGER | FK → artists.id, NOT NULL | Track artist |
| album_id | INTEGER | FK → albums.id, NULLABLE | Track album |
| url | TEXT | NULLABLE | Last.fm track page |
| duration_ms | INTEGER | NULLABLE | Track duration |
| created_at | DATETIME | NOT NULL | First seen timestamp |
| -- SPOTIFY PLACEHOLDERS -- | | | |
| spotify_id | TEXT | NULLABLE | Spotify track ID |
| spotify_uri | TEXT | NULLABLE | Spotify URI |
| spotify_popularity | INTEGER | NULLABLE | Spotify popularity score (0-100) |
| spotify_popularity_updated_at | DATETIME | NULLABLE | When popularity was last fetched |
| spotify_preview_url | TEXT | NULLABLE | 30-second audio preview URL |
| isrc | TEXT | NULLABLE | International Standard Recording Code |

**Index:** `idx_tracks_mbid` on `lastfm_mbid`
**Index:** `idx_tracks_artist` on `artist_id`
**Index:** `idx_tracks_spotify` on `spotify_id`

#### `audio_features` (Spotify Placeholder)
Pre-created table for future Spotify audio features integration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal ID |
| track_id | INTEGER | FK → tracks.id, UNIQUE | Associated track |
| spotify_id | TEXT | NULLABLE | Spotify track ID |
| danceability | REAL | NULLABLE | 0.0 - 1.0 |
| energy | REAL | NULLABLE | 0.0 - 1.0 |
| valence | REAL | NULLABLE | 0.0 - 1.0 (positiveness) |
| tempo | REAL | NULLABLE | BPM |
| loudness | REAL | NULLABLE | dB |
| speechiness | REAL | NULLABLE | 0.0 - 1.0 |
| acousticness | REAL | NULLABLE | 0.0 - 1.0 |
| instrumentalness | REAL | NULLABLE | 0.0 - 1.0 |
| liveness | REAL | NULLABLE | 0.0 - 1.0 |
| key | INTEGER | NULLABLE | 0-11 (pitch class) |
| mode | INTEGER | NULLABLE | 0=minor, 1=major |
| time_signature | INTEGER | NULLABLE | Beats per bar |
| fetched_at | DATETIME | NULLABLE | When features were fetched |

**Index:** `idx_audio_features_track` on `track_id`
**Index:** `idx_audio_features_spotify` on `spotify_id`

#### `scrobbles`
Main listening history table.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal scrobble ID |
| user_id | INTEGER | FK → users.id, NOT NULL | User who scrobbled |
| track_id | INTEGER | FK → tracks.id, NOT NULL | Scrobbled track |
| listened_at | DATETIME | NOT NULL | UTC timestamp |
| listened_at_local | DATETIME | NULLABLE | Local time (if available) |
| source | TEXT | NULLABLE | Scrobble source (e.g., 'Spotify') |

**Index:** `idx_scrobbles_user_time` on `(user_id, listened_at)` - Primary query pattern
**Index:** `idx_scrobbles_track` on `track_id`
**Unique Constraint:** `uq_scrobbles` on `(user_id, track_id, listened_at)` - Prevents duplicates

#### `loved_tracks`
User's loved/favorited tracks.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal ID |
| user_id | INTEGER | FK → users.id | User |
| track_id | INTEGER | FK → tracks.id | Loved track |
| loved_at | DATETIME | NOT NULL | When track was loved |

**Unique Constraint:** `uq_loved` on `(user_id, track_id)`

#### `sync_log`
Audit log for sync operations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal ID |
| user_id | INTEGER | FK → users.id | User |
| started_at | DATETIME | NOT NULL | Sync start time |
| completed_at | DATETIME | NULLABLE | Sync completion time |
| status | TEXT | NOT NULL | 'running', 'success', 'failed' |
| scrobbles_fetched | INTEGER | DEFAULT 0 | New scrobbles found |
| error_message | TEXT | NULLABLE | Error details if failed |

#### `user_metrics`
Pre-computed metrics cache.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal ID |
| user_id | INTEGER | FK → users.id | User |
| metric_type | TEXT | NOT NULL | Metric identifier |
| metric_key | TEXT | NULLABLE | Sub-key (e.g., artist name) |
| metric_value | REAL | NOT NULL | Computed value |
| period_start | DATE | NULLABLE | Period start (for time-based) |
| period_end | DATE | NULLABLE | Period end |
| computed_at | DATETIME | NOT NULL | When computed |

**Index:** `idx_metrics_user_type` on `(user_id, metric_type)`

### Recommendation System Tables

#### `artist_tags`
Tags associated with artists from Last.fm (genres, moods, etc.).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal ID |
| artist_id | INTEGER | FK → artists.id, NOT NULL, INDEX | Associated artist |
| tag | TEXT | NOT NULL | Tag name (e.g., 'rock', 'indie') |
| count | INTEGER | DEFAULT 0 | Tag weight/popularity from Last.fm |
| fetched_at | DATETIME | NOT NULL | When tag was fetched |

**Index:** `idx_artist_tags_tag` on `tag`
**Unique Constraint:** `uq_artist_tag` on `(artist_id, tag)`

#### `track_tags`
Tags associated with tracks from Last.fm.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal ID |
| track_id | INTEGER | FK → tracks.id, NOT NULL, INDEX | Associated track |
| tag | TEXT | NOT NULL | Tag name |
| count | INTEGER | DEFAULT 0 | Tag weight/popularity |
| fetched_at | DATETIME | NOT NULL | When tag was fetched |

**Index:** `idx_track_tags_tag` on `tag`
**Unique Constraint:** `uq_track_tag` on `(track_id, tag)`

#### `similar_artists`
Similar artist relationships from Last.fm.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal ID |
| artist_id | INTEGER | FK → artists.id, NOT NULL, INDEX | Source artist |
| similar_artist_name | TEXT | NOT NULL | Similar artist name (may not be in DB) |
| similar_artist_mbid | TEXT | NULLABLE | MusicBrainz ID if available |
| match_score | FLOAT | NOT NULL | Similarity score (0.0 to 1.0) |
| fetched_at | DATETIME | NOT NULL | When relationship was fetched |

**Index:** `idx_similar_match` on `match_score`
**Unique Constraint:** `uq_similar_artist` on `(artist_id, similar_artist_name)`

#### `recommendations`
Generated recommendations for users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal ID |
| user_id | INTEGER | FK → users.id, NOT NULL, INDEX | User who received recommendation |
| track_id | INTEGER | FK → tracks.id, NOT NULL, INDEX | Recommended track |
| recommendation_score | FLOAT | NOT NULL | Calculated score (0.0 to 1.0) |
| reason | TEXT | NULLABLE | Human-readable explanation |
| mode | TEXT | NOT NULL | 'comfort_zone' or 'branch_out' |
| popularity_filter | TEXT | NULLABLE | 'mainstream', 'balanced', 'niche' |
| session_id | TEXT | NULLABLE, INDEX | Groups recommendations by generation session |
| generated_at | DATETIME | NOT NULL | When recommendation was created |
| presented_at | DATETIME | NULLABLE | When shown to user |
| feedback | TEXT | NULLABLE | 'like', 'dislike', 'skip', or null |

**Index:** `idx_recommendations_user_session` on `(user_id, session_id)`
**Index:** `idx_recommendations_generated` on `generated_at`

#### `recommendation_feedback`
Detailed feedback on recommendations for learning.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal ID |
| recommendation_id | INTEGER | FK → recommendations.id, NULLABLE, INDEX | Related recommendation |
| user_id | INTEGER | FK → users.id, NOT NULL, INDEX | User providing feedback |
| track_id | INTEGER | FK → tracks.id, NOT NULL, INDEX | Track being rated |
| feedback_type | TEXT | NOT NULL | 'like', 'dislike', 'skip' |
| source_tags | TEXT | NULLABLE | JSON array of tags that led to this rec |
| timestamp | DATETIME | NOT NULL | When feedback was recorded |

**Index:** `idx_feedback_user_type` on `(user_id, feedback_type)`

#### `listening_sessions`
Track co-listening patterns - artists/tracks played together.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal ID |
| user_id | INTEGER | FK → users.id, NOT NULL, INDEX | Session owner |
| session_start | DATETIME | NOT NULL | When session began |
| session_end | DATETIME | NULLABLE | When session ended |
| track_ids | TEXT | NULLABLE | JSON array of track IDs in session |
| artist_ids | TEXT | NULLABLE | JSON array of artist IDs in session |
| track_count | INTEGER | DEFAULT 0 | Number of tracks in session |

**Index:** `idx_sessions_user_time` on `(user_id, session_start)`

#### `co_listening_patterns`
Pre-computed co-listening relationships between artists.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTO | Internal ID |
| user_id | INTEGER | FK → users.id, NOT NULL, INDEX | Pattern owner |
| artist_id_1 | INTEGER | FK → artists.id, NOT NULL, INDEX | First artist |
| artist_id_2 | INTEGER | FK → artists.id, NOT NULL, INDEX | Second artist |
| co_occurrence_count | INTEGER | DEFAULT 0 | Times played in same session |
| affinity_score | FLOAT | NULLABLE | Normalized 0-1 similarity score |
| computed_at | DATETIME | NOT NULL | When pattern was computed |

**Unique Constraint:** `uq_co_listening` on `(user_id, artist_id_1, artist_id_2)`
**Index:** `idx_co_listening_artists` on `(artist_id_1, artist_id_2)`

## API Endpoints

### Configuration

#### `POST /api/config`
Save Last.fm API credentials.

**Request Body:**
```json
{
  "username": "lastfm_username",
  "api_key": "your_api_key"
}
```

**Response:** `200 OK` or `400 Bad Request`

#### `GET /api/config`
Get current configuration (API key masked).

**Response:**
```json
{
  "configured": true,
  "username": "lastfm_username",
  "last_sync": "2024-01-15T10:30:00Z",
  "sync_interval": 30
}
```

### Sync Operations

#### `POST /api/sync`
Trigger manual sync.

**Response:**
```json
{
  "status": "started",
  "sync_id": 123
}
```

#### `GET /api/sync/status`
Get current sync status.

**Response:**
```json
{
  "is_syncing": false,
  "last_sync": "2024-01-15T10:30:00Z",
  "last_sync_status": "success",
  "scrobbles_last_sync": 42
}
```

### Data Retrieval

#### `GET /api/scrobbles`
Get recent listening history.

**Query Parameters:**
- `page` (int, default 1): Page number
- `per_page` (int, default 50, max 200): Items per page
- `from` (ISO datetime): Start date filter
- `to` (ISO datetime): End date filter
- `artist` (string): Filter by artist name

**Response:**
```json
{
  "scrobbles": [
    {
      "id": 1234,
      "track": "Song Name",
      "artist": "Artist Name",
      "album": "Album Name",
      "listened_at": "2024-01-15T10:30:00Z",
      "image_url": "https://...",
      "track_id": 56,
      "artist_id": 12
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 1000,
    "pages": 20
  }
}
```

#### `GET /api/stats`
Get aggregated statistics.

**Response:**
```json
{
  "total_scrobbles": 15000,
  "unique_tracks": 2500,
  "unique_artists": 450,
  "unique_albums": 800,
  "first_scrobble": "2020-01-01T00:00:00Z",
  "last_scrobble": "2024-01-15T10:30:00Z",
  "scrobbles_today": 25,
  "scrobbles_this_week": 180,
  "scrobbles_this_month": 750
}
```

#### `GET /api/top/artists`
Get top artists.

**Query Parameters:**
- `period` (string): 'week', 'month', 'year', 'all' (default 'all')
- `limit` (int, default 10, max 100): Number of results

**Response:**
```json
{
  "artists": [
    {
      "id": 12,
      "name": "Artist Name",
      "play_count": 500,
      "image_url": "https://..."
    }
  ],
  "period": "all"
}
```

#### `GET /api/top/tracks`
Get top tracks. Same parameters as `/api/top/artists`.

#### `GET /api/loved`
Get loved tracks.

**Response:**
```json
{
  "loved_tracks": [
    {
      "track": "Song Name",
      "artist": "Artist Name",
      "loved_at": "2024-01-10T15:00:00Z"
    }
  ],
  "total": 150
}
```

### Export

#### `GET /api/export`
Export data in various formats.

**Query Parameters:**
- `format` (string): 'json', 'csv', 'parquet' (default 'json')
- `type` (string): 'scrobbles', 'tracks', 'artists', 'full' (default 'scrobbles')
- `from` (ISO datetime): Start date
- `to` (ISO datetime): End date
- `include_audio_features` (bool): Include Spotify features if available

**Response:** File download or JSON

### Metrics

#### `GET /api/metrics/listening-patterns`
Get time-of-day listening patterns.

**Response:**
```json
{
  "hourly": [
    {"hour": 0, "count": 120},
    {"hour": 1, "count": 80},
    ...
  ],
  "daily": [
    {"day": "Monday", "count": 2500},
    ...
  ]
}
```

#### `GET /api/metrics/streaks`
Get listening streak information.

**Response:**
```json
{
  "current_streak": 15,
  "longest_streak": 45,
  "streak_start": "2024-01-01"
}
```

### Recommendations

#### `POST /api/recommendations/generate`
Generate personalized track recommendations.

**Request Body:**
```json
{
  "time_period": "month",
  "selected_artists": [12, 34, 56],
  "mode": "comfort_zone",
  "popularity": "balanced"
}
```

**Response:**
```json
{
  "recommendations": [
    {
      "track_id": 123,
      "track_name": "Song Name",
      "artist_name": "Artist Name",
      "album_name": "Album Name",
      "score": 0.85,
      "reason": "95% tag match with your taste",
      "spotify_uri": "spotify:track:abc123",
      "preview_url": "https://p.scdn.co/mp3-preview/...",
      "recommendation_id": 456
    }
  ],
  "session_id": "uuid-string",
  "mode": "comfort_zone",
  "generated_at": "2025-02-04T12:00:00Z"
}
```

#### `POST /api/recommendations/feedback`
Record user feedback on a recommendation.

**Request Body:**
```json
{
  "recommendation_id": 123,
  "track_id": 456,
  "feedback_type": "like"
}
```

**Response:** `200 OK` with `{"success": true}`

#### `GET /api/recommendations/liked`
Get liked tracks history.

**Query Parameters:**
- `limit` (int, default 50): Maximum number of results

**Response:**
```json
{
  "liked_tracks": [
    {
      "track_id": 123,
      "track_name": "Song Name",
      "artist_name": "Artist Name",
      "album_name": "Album Name",
      "album_image_url": "https://...",
      "preview_url": "https://p.scdn.co/mp3-preview/...",
      "spotify_uri": "spotify:track:abc123",
      "liked_at": "2026-03-24T12:00:00Z"
    }
  ],
  "total": 5
}
```

#### `GET /api/recommendations/stats`
Get recommendation statistics. Queries `RecommendationFeedback` table for accurate counts.

**Response:**
```json
{
  "total_generated": 500,
  "likes": 120,
  "dislikes": 30,
  "like_rate": 80.0,
  "top_performing_mode": "comfort_zone"
}
```

### Spotify Integration

#### `GET /api/spotify/status`
Get Spotify integration status.

**Response:**
```json
{
  "enabled": true,
  "connected": true,
  "status": "connected",
  "message": "Spotify connected"
}
```

#### `POST /api/spotify/create-playlist`
Create a real Spotify playlist from recommendations. Falls back to export if not connected.

**Request Body:**
```json
{
  "track_ids": [1, 2, 3],
  "playlist_name": "My Discovery Playlist"
}
```

**Response (connected):**
```json
{
  "success": true,
  "playlist_url": "https://open.spotify.com/playlist/...",
  "playlist_name": "My Discovery Playlist",
  "tracks_added": 3,
  "tracks_not_found": 0
}
```

### Enhanced Sync

#### `POST /api/enhanced-sync`
Trigger enhanced data collection (tags, similar artists, co-listening).

**Response:**
```json
{
  "status": "started",
  "message": "Enhanced sync started"
}
```

#### `GET /api/enhanced-sync/status`
Get enhanced sync status and data availability.

**Response:**
```json
{
  "artist_tags": 150,
  "track_tags": 500,
  "similar_artists": 300,
  "listening_sessions": 45,
  "co_listening_patterns": 200,
  "is_syncing": false
}
```

## Background Sync Implementation

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                   APScheduler                        │
│  ┌─────────────────────────────────────────────┐    │
│  │  BackgroundScheduler (SQLite Job Store)     │    │
│  │                                              │    │
│  │  Job: sync_job                              │    │
│  │  Trigger: IntervalTrigger(minutes=30)       │    │
│  │  Executor: ThreadPoolExecutor               │    │
│  └──────────────────┬──────────────────────────┘    │
└─────────────────────┼───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              SyncService.sync()                      │
│  1. Check if sync already running (lock)            │
│  2. Create sync_log entry                           │
│  3. Fetch recent scrobbles from Last.fm             │
│  4. Deduplicate against existing                    │
│  5. Insert new artists/albums/tracks                │
│  6. Insert new scrobbles                            │
│  7. Update user.last_sync_at                        │
│  8. Trigger metrics recomputation                   │
│  9. Update sync_log with results                    │
└─────────────────────────────────────────────────────┘
```

### Deduplication Strategy

Scrobbles are deduplicated using a unique constraint on `(user_id, track_id, listened_at)`.

The sync process:
1. Fetches recent scrobbles from Last.fm API
2. For each scrobble, creates/finds the normalized track, artist, album
3. Attempts INSERT with ON CONFLICT IGNORE
4. Counts successful inserts for reporting

### Resilience Features

1. **Job Persistence**: APScheduler uses SQLite job store - survives restarts
2. **Sync Locking**: Prevents concurrent syncs using database flag
3. **Retry Logic**: Failed API calls retry with exponential backoff
4. **Partial Success**: Each scrobble inserted independently - partial sync possible
5. **Sync Logging**: Full audit trail of all sync attempts

## Pre-Computed Metrics

### Metric Types and Formulas

| Metric Type | Description | Formula/Logic |
|-------------|-------------|---------------|
| `play_count_track` | Plays per track | `COUNT(scrobbles) GROUP BY track_id` |
| `play_count_artist` | Plays per artist | `COUNT(scrobbles) GROUP BY artist_id` |
| `play_count_album` | Plays per album | `COUNT(scrobbles) GROUP BY album_id` |
| `hourly_distribution` | Scrobbles per hour | `COUNT(*) WHERE HOUR(listened_at) = X` |
| `daily_distribution` | Scrobbles per weekday | `COUNT(*) WHERE DAYOFWEEK(listened_at) = X` |
| `listening_streak` | Consecutive days | Custom streak calculation algorithm |
| `discovery_rate` | New artists per week | `COUNT(DISTINCT new artists) / week` |
| `genre_diversity` | Unique genres ratio | Requires genre tagging (future) |

### Streak Calculation Algorithm

```python
def calculate_streak(scrobbles):
    """
    A 'listening day' is any calendar day (UTC) with >= 1 scrobble.
    Streak = consecutive listening days ending today (or yesterday if no scrobbles today yet).
    """
    dates = set(s.listened_at.date() for s in scrobbles)
    today = date.today()

    # Start from today or yesterday
    current = today if today in dates else today - timedelta(days=1)
    if current not in dates:
        return 0

    streak = 0
    while current in dates:
        streak += 1
        current -= timedelta(days=1)

    return streak
```

### Recomputation Schedule

- **On sync completion**: Play counts, streak
- **Daily (midnight UTC)**: Time distributions, discovery rate
- **Weekly**: All metrics full recompute

## Architectural Decisions

### Why SQLite?

1. **Portability**: Single file, easy backup, works on any platform
2. **Performance**: More than sufficient for single-user music tracking
3. **Simplicity**: No server process, zero configuration
4. **Compatibility**: Excellent pandas/Jupyter integration via `pd.read_sql()`

### Why Normalized Schema?

Despite potential query complexity, normalization provides:
1. **Data integrity**: No duplicate artist/track data
2. **Flexibility**: Easy to add Spotify data later
3. **Storage efficiency**: Large libraries can have 100k+ scrobbles
4. **Query power**: Complex analytics queries remain fast

### Why APScheduler over Celery?

1. **Simplicity**: No Redis/RabbitMQ dependency
2. **Persistence**: SQLite job store matches our DB choice
3. **Scale**: Single-user app doesn't need distributed task queue
4. **Integration**: Native Flask integration

## Recommendation System

### Algorithm Overview

The recommendation engine uses a hybrid approach combining tag-based similarity, co-listening patterns, and similar artist relationships from Last.fm.

### Mode Weights

**Comfort Zone Mode** (finds similar tracks):
| Component | Weight | Description |
|-----------|--------|-------------|
| Tag Similarity | 60% | Cosine similarity between user's tag profile and track tags |
| Co-Listening | 30% | Artists frequently played together in sessions |
| Recency | 10% | Bonus for newer tracks |

**Branch Out Mode** (discovery):
| Component | Weight | Description |
|-----------|--------|-------------|
| Similar Artist Network | 50% | Last.fm similar artist match scores |
| Tag Overlap | 30% | Shared tags with user's preferences |
| Popularity (inverse) | 20% | Prefers less-played tracks for discovery |

### Feedback Learning

User feedback adjusts future recommendations:
- **+15% boost** for tags from liked tracks
- **-15% penalty** for tags from disliked tracks

Feedback is accumulated over time to build a user preference profile.

### Tag Similarity Calculation

Uses cosine similarity between tag vectors:

```python
def calculate_tag_similarity(tags1, tags2):
    """
    tags1, tags2: Dict of {tag_name: weight}
    Returns: similarity score 0.0 to 1.0
    """
    all_tags = set(tags1.keys()) | set(tags2.keys())

    dot_product = sum(tags1.get(t, 0) * tags2.get(t, 0) for t in all_tags)
    mag1 = sqrt(sum(v**2 for v in tags1.values()))
    mag2 = sqrt(sum(v**2 for v in tags2.values()))

    return dot_product / (mag1 * mag2) if mag1 and mag2 else 0
```

### Co-Listening Pattern Detection

Sessions are detected by analyzing gaps between scrobbles:
- Gap > 30 minutes = new session
- Tracks in the same session indicate co-listening affinity
- Affinity score = co-occurrence count / total sessions for both artists

### Diversity Enforcement

To prevent recommendations dominated by one artist:
- Maximum 3 tracks per artist by default
- Exception: 5 tracks if similarity score > 0.8

### Recommendation Pipeline

```
1. Select time period and seed artists
2. Build user tag profile from listening history
3. Load feedback weights from past interactions
4. Generate candidates based on mode:
   - Comfort Zone: Same artists + similar tags
   - Branch Out: Similar artists from Last.fm
5. Score candidates using weighted formula
6. Apply popularity filter (mainstream/balanced/niche)
7. Apply feedback adjustments (+/- 15%)
8. Enforce diversity limits
9. Return top 25 ranked recommendations
```

## Spotify Integration

Real Spotify API integration using `spotipy`. Provides OAuth playlist creation, track matching, and popularity data.

### Setup

1. Create a `.env` file in the project root (gitignored):
```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

2. Register your app at [developer.spotify.com](https://developer.spotify.com):
   - Check "Web API" when creating the app
   - Add `http://127.0.0.1:5000/api/spotify/callback` as a redirect URI
   - **Important:** Use `127.0.0.1`, not `localhost` — Spotify requires IP-based loopback URIs
   - Add your Spotify email to User Management (required for Development mode apps)

3. Environment is loaded automatically via `python-dotenv` at app startup.

### How It Works

**Without env vars:** Falls back to mock/export behavior (text file download). No errors.

**With env vars but no user OAuth:** Client credentials mode enables:
- Track search and matching (background job, every 5 min)
- Popularity data fetching (background job, every 10 min)
- These run automatically — no user action needed

**With user OAuth:** Full integration:
- Direct Spotify playlist creation from recommendations
- User connects via "Connect Spotify" button on `/discover` page

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  spotify_client.py                                   │
│                                                      │
│  is_spotify_configured()  ← checks env vars          │
│  _get_client_credentials_sp() ← search/popularity    │
│  search_track()           ← convenience wrapper      │
│                                                      │
│  SpotifyClient(user_id)                              │
│  ├── search_track()    ← client credentials          │
│  ├── create_playlist() ← requires user OAuth         │
│  │   └── uses sp._post('me/playlists', ...) *        │
│  ├── get_auth_url()    ← OAuth flow start            │
│  ├── handle_callback() ← OAuth flow complete         │
│  └── disconnect()      ← clear stored tokens         │
└─────────────────────────────────────────────────────┘
* Uses /me/playlists instead of /users/{id}/playlists
  due to Spotify Development mode restrictions
```

### OAuth Flow

1. User clicks "Connect Spotify" → `GET /api/spotify/authenticate`
2. Backend returns Spotify auth URL → frontend redirects user
3. User authorizes → Spotify redirects to `GET /api/spotify/callback`
4. Backend exchanges code for tokens → stored in `users` table
5. User redirected back to `/discover`

Tokens stored: `spotify_access_token`, `spotify_refresh_token`, `spotify_token_expires_at`
Token refresh is automatic when expired.

### Background Jobs

**`match_tracks_to_spotify_batch`** (every 5 min):
- Finds tracks without `spotify_id`, prioritized by play count
- Searches Spotify, stores `spotify_id`, `spotify_uri`, `spotify_popularity`, `spotify_preview_url`
- Marks unfound tracks with `spotify_id = ''` to skip re-searching
- Uses client credentials (no user auth needed)

**`refresh_spotify_popularity_batch`** (every 10 min):
- Refreshes stale popularity scores (>7 days old)
- Uses Spotify's batch `/tracks` endpoint (50 tracks per call)
- Updates `spotify_popularity` and `spotify_popularity_updated_at`
- **Known issue:** `/v1/tracks` endpoint returns 403 in Spotify Development mode; popularity is primarily populated during initial track matching via search

### Popularity Scoring

The recommendation engine (`recommender.py`) uses Spotify's `popularity` field (0-100) for niche/mainstream filtering:
- **Niche**: popularity < 40
- **Balanced**: no filter
- **Mainstream**: popularity > 50
- Falls back to local scrobble count if no Spotify data

### Spotify API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/spotify/status` | GET | Integration status and auth state |
| `/api/spotify/authenticate` | GET | Start OAuth flow (returns auth URL) |
| `/api/spotify/callback` | GET | OAuth callback (stores tokens) |
| `/api/spotify/disconnect` | POST | Clear Spotify tokens |
| `/api/spotify/search-track` | POST | Search Spotify for a track |
| `/api/spotify/create-playlist` | POST | Create playlist (real or export fallback) |
| `/api/spotify/export` | POST | Export tracks for manual import |

### Audio Preview

Recommendation cards include a 30-second audio preview button when `preview_url` is available from Spotify search results. Preview URLs are stored on the Track model (`spotify_preview_url`) and included in recommendation API responses.

The player uses a single `<audio>` element that toggles between tracks. Only one preview plays at a time.

### Liked Tracks

The Discover page includes a collapsible "Liked Tracks" section showing all tracks the user has liked via recommendation feedback. Data is fetched from `/api/recommendations/liked` (queries `RecommendationFeedback` table joined with Track/Artist). Each entry shows track name, artist, date liked, and a preview button if available.

### Known Spotify Development Mode Limitations

Spotify apps in Development mode have restrictions:
- `/v1/users/{id}/playlists` returns 403 — use `/v1/me/playlists` instead
- `/v1/tracks` batch endpoint returns 403 — popularity comes from search results instead
- Only users added to User Management can authorize the app
- App must use `127.0.0.1` (not `localhost`) for redirect URIs

### Future Enhancements

- Batch audio features fetch to populate `audio_features` table
- Real-time Spotify listening (in addition to Last.fm scrobbles)
- Spotify library/playlist import

## Scalability Notes (Future Multi-User)

Current single-user design includes multi-user preparation:

1. **User ID in all tables**: Every data table has `user_id` foreign key
2. **Unique constraints include user**: Prevents cross-user conflicts
3. **Config per user**: Each user has own API keys

### Migration to Multi-User

1. Add authentication (Flask-Login or similar)
2. Add user registration flow
3. Update sync scheduler to handle multiple users
4. Add rate limiting per user
5. Consider PostgreSQL for concurrent writes

## Configuration Reference

```python
# config.py defaults
DATABASE_PATH = "data/lastfm_tracker.db"
SYNC_INTERVAL_MINUTES = 30
LASTFM_API_BASE = "https://ws.audioscrobbler.com/2.0/"
MAX_SCROBBLES_PER_FETCH = 200
INITIAL_BACKFILL_PAGES = 50  # ~10,000 scrobbles

# Spotify (set via .env file, loaded by python-dotenv)
SPOTIFY_CLIENT_ID = None       # Required for Spotify integration
SPOTIFY_CLIENT_SECRET = None   # Required for Spotify integration
SPOTIFY_REDIRECT_URI = "http://127.0.0.1:5000/api/spotify/callback"
SPOTIFY_SCOPE = "playlist-modify-public playlist-modify-private"
```

## Error Handling Strategy

| Error Type | Handling |
|------------|----------|
| API rate limit | Exponential backoff, max 5 retries |
| Network timeout | Retry after 30 seconds |
| Invalid API key | Mark sync failed, notify user |
| Database locked | Queue operation, retry |
| Partial sync failure | Continue, log failed items |

---

*Last Updated: 2026-03-24*
*Version: 3.1.0* (Audio Preview, Liked Tracks, Stats Fix, Spotify Dev Mode Fixes)
