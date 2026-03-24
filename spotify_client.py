"""
Spotify Integration Client for Last.fm Listening History Tracker.

Provides OAuth authentication, track search, playlist creation, and
popularity data fetching via the Spotify Web API using spotipy.

When SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are set in the environment,
real Spotify API calls are used. Otherwise, falls back to mock/export behavior.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import spotipy
from spotipy.oauth2 import SpotifyOAuth, SpotifyClientCredentials
from spotipy.cache_handler import MemoryCacheHandler

from models import db, Track, Artist, User

logger = logging.getLogger(__name__)


def _get_spotify_config() -> Dict:
    """Get Spotify config from Flask app config."""
    from config import get_config
    config = get_config()
    return {
        'client_id': getattr(config, 'SPOTIFY_CLIENT_ID', None),
        'client_secret': getattr(config, 'SPOTIFY_CLIENT_SECRET', None),
        'redirect_uri': getattr(config, 'SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:5000/api/spotify/callback'),
        'scope': getattr(config, 'SPOTIFY_SCOPE', 'playlist-modify-public playlist-modify-private'),
    }


def is_spotify_configured() -> bool:
    """Check if Spotify API credentials are set."""
    cfg = _get_spotify_config()
    return bool(cfg['client_id'] and cfg['client_secret'])


def _get_client_credentials_sp() -> Optional[spotipy.Spotify]:
    """Get a spotipy client using client credentials flow (no user auth needed).

    Used for search and popularity fetching — does not require user login.
    """
    if not is_spotify_configured():
        return None

    cfg = _get_spotify_config()
    auth_manager = SpotifyClientCredentials(
        client_id=cfg['client_id'],
        client_secret=cfg['client_secret'],
        cache_handler=MemoryCacheHandler()
    )
    return spotipy.Spotify(auth_manager=auth_manager)


class SpotifyClient:
    """
    Spotify API client for track matching and playlist creation.

    - Track search and popularity: uses client credentials (no user login)
    - Playlist creation: requires user OAuth authentication
    """

    def __init__(self, user_id: int = None):
        self.user_id = user_id
        self.user = User.query.get(user_id) if user_id else None

    def is_authenticated(self) -> bool:
        """Check if user has valid Spotify authentication."""
        if not self.user or not self.user.spotify_access_token:
            return False
        return True

    def get_auth_url(self) -> str:
        """Get Spotify authorization URL for OAuth flow."""
        cfg = _get_spotify_config()
        sp_oauth = SpotifyOAuth(
            client_id=cfg['client_id'],
            client_secret=cfg['client_secret'],
            redirect_uri=cfg['redirect_uri'],
            scope=cfg['scope'],
            cache_handler=MemoryCacheHandler(),
            show_dialog=True
        )
        return sp_oauth.get_authorize_url()

    def handle_callback(self, code: str) -> Dict:
        """Exchange OAuth authorization code for access/refresh tokens."""
        cfg = _get_spotify_config()
        sp_oauth = SpotifyOAuth(
            client_id=cfg['client_id'],
            client_secret=cfg['client_secret'],
            redirect_uri=cfg['redirect_uri'],
            scope=cfg['scope'],
            cache_handler=MemoryCacheHandler()
        )
        token_info = sp_oauth.get_access_token(code)
        logger.info(f"Spotify token scopes: {token_info.get('scope', 'NONE')}")

        self.user.spotify_access_token = token_info['access_token']
        self.user.spotify_refresh_token = token_info['refresh_token']
        self.user.spotify_token_expires_at = (
            datetime.utcnow() + timedelta(seconds=token_info['expires_in'] - 60)
        )
        db.session.commit()

        return {'status': 'connected', 'mock': False}

    def disconnect(self) -> Dict:
        """Clear stored Spotify tokens."""
        if self.user:
            self.user.spotify_access_token = None
            self.user.spotify_refresh_token = None
            self.user.spotify_token_expires_at = None
            db.session.commit()
        return {'status': 'disconnected'}

    def _get_authenticated_sp(self) -> Optional[spotipy.Spotify]:
        """Get a user-authenticated spotipy client, refreshing token if needed."""
        if not self.is_authenticated():
            return None

        # Refresh if expired
        if (self.user.spotify_token_expires_at and
                self.user.spotify_token_expires_at <= datetime.utcnow()):
            if not self._refresh_token():
                return None

        return spotipy.Spotify(auth=self.user.spotify_access_token)

    def _refresh_token(self) -> bool:
        """Refresh the Spotify access token using the refresh token."""
        if not self.user or not self.user.spotify_refresh_token:
            return False

        try:
            cfg = _get_spotify_config()
            sp_oauth = SpotifyOAuth(
                client_id=cfg['client_id'],
                client_secret=cfg['client_secret'],
                redirect_uri=cfg['redirect_uri'],
                scope=cfg['scope'],
                cache_handler=MemoryCacheHandler()
            )
            token_info = sp_oauth.refresh_access_token(self.user.spotify_refresh_token)

            self.user.spotify_access_token = token_info['access_token']
            if 'refresh_token' in token_info:
                self.user.spotify_refresh_token = token_info['refresh_token']
            self.user.spotify_token_expires_at = (
                datetime.utcnow() + timedelta(seconds=token_info['expires_in'] - 60)
            )
            db.session.commit()
            return True
        except Exception as e:
            logger.error(f"Failed to refresh Spotify token: {e}")
            return False

    def search_track(self, track_name: str, artist_name: str) -> Dict:
        """Search Spotify for a track. Uses client credentials (no user auth)."""
        sp = _get_client_credentials_sp()
        if not sp:
            return {
                'found': False,
                'mock': True,
                'message': 'Spotify not configured',
                'track_name': track_name,
                'artist_name': artist_name,
                'suggestion': f'Search manually: "{track_name}" by {artist_name}'
            }

        try:
            query = f"track:{track_name} artist:{artist_name}"
            results = sp.search(q=query, type='track', limit=1)

            if results['tracks']['items']:
                item = results['tracks']['items'][0]
                album_images = item.get('album', {}).get('images', [])
                return {
                    'found': True,
                    'mock': False,
                    'spotify_id': item['id'],
                    'spotify_uri': item['uri'],
                    'popularity': item.get('popularity'),
                    'preview_url': item.get('preview_url'),
                    'album_image': album_images[0]['url'] if album_images else None
                }

            return {'found': False, 'mock': False, 'message': 'Track not found on Spotify'}

        except Exception as e:
            logger.warning(f"Spotify search failed for '{track_name}' by '{artist_name}': {e}")
            return {'found': False, 'mock': False, 'message': str(e)}

    def create_playlist(
        self,
        track_ids: List[int],
        playlist_name: str,
        description: str = None
    ) -> Dict:
        """Create a Spotify playlist from internal track IDs.

        Requires user OAuth. Falls back to export if not authenticated.
        """
        sp = self._get_authenticated_sp()
        if not sp:
            return self._mock_create_playlist(track_ids, playlist_name)

        tracks = Track.query.filter(Track.id.in_(track_ids)).all()

        # Collect Spotify URIs, searching on-the-fly for unmatched tracks
        uris = []
        unmatched = []
        for track in tracks:
            if track.spotify_uri:
                uris.append(track.spotify_uri)
            else:
                artist_name = track.artist.name if track.artist else ''
                result = self.search_track(track.name, artist_name)
                if result.get('found'):
                    track.spotify_uri = result['spotify_uri']
                    track.spotify_id = result['spotify_id']
                    if result.get('popularity') is not None:
                        track.spotify_popularity = result['popularity']
                        track.spotify_popularity_updated_at = datetime.utcnow()
                    if result.get('preview_url'):
                        track.spotify_preview_url = result['preview_url']
                    uris.append(result['spotify_uri'])
                else:
                    unmatched.append({
                        'name': track.name,
                        'artist': artist_name
                    })

        db.session.commit()

        if not uris:
            return {
                'error': 'No tracks could be matched to Spotify',
                'unmatched': unmatched
            }

        try:
            playlist = sp._post(
                'me/playlists',
                payload={
                    'name': playlist_name,
                    'public': True,
                    'description': description or f"Generated by Last.fm Tracker on {datetime.utcnow().strftime('%Y-%m-%d')}"
                }
            )

            # Add tracks in batches of 100 (Spotify API limit)
            for i in range(0, len(uris), 100):
                sp.playlist_add_items(playlist['id'], uris[i:i + 100])

            return {
                'mock': False,
                'status': 'created',
                'playlist_url': playlist['external_urls']['spotify'],
                'playlist_id': playlist['id'],
                'tracks_added': len(uris),
                'tracks_unmatched': len(unmatched),
                'unmatched': unmatched if unmatched else None
            }
        except Exception as e:
            logger.error(f"Failed to create Spotify playlist: {e}")
            return {'error': f'Failed to create playlist: {e}'}

    def _mock_create_playlist(self, track_ids: List[int], playlist_name: str) -> Dict:
        """Fallback: return export data when Spotify isn't authenticated."""
        tracks = Track.query.filter(Track.id.in_(track_ids)).all()
        track_list = []
        for track in tracks:
            track_list.append({
                'track_id': track.id,
                'name': track.name,
                'artist': track.artist.name if track.artist else 'Unknown',
                'spotify_uri': track.spotify_uri,
                'search_query': f"{track.name} {track.artist.name if track.artist else ''}"
            })

        return {
            'mock': True,
            'status': 'export_ready',
            'message': 'Connect your Spotify account to create playlists directly.',
            'playlist_name': playlist_name,
            'track_count': len(track_list),
            'tracks': track_list,
            'instructions': [
                '1. Open Spotify and create a new playlist',
                f'2. Name it: {playlist_name}',
                '3. Search for each track below and add to playlist',
            ]
        }


# =========================================================================
# Module-level convenience functions (used by app.py routes)
# =========================================================================

def search_track(track_id: int) -> Dict:
    """Search Spotify for a track from our database."""
    track = Track.query.get(track_id)
    if not track:
        return {'error': 'Track not found', 'track_id': track_id}

    # Return cached result if we already have a Spotify URI
    if track.spotify_uri:
        return {
            'found': True,
            'cached': True,
            'spotify_uri': track.spotify_uri,
            'spotify_id': track.spotify_id
        }

    client = SpotifyClient()
    artist_name = track.artist.name if track.artist else ''
    result = client.search_track(track.name, artist_name)

    # Store result if found
    if result.get('found') and result.get('spotify_uri'):
        track.spotify_uri = result['spotify_uri']
        track.spotify_id = result['spotify_id']
        if result.get('popularity') is not None:
            track.spotify_popularity = result['popularity']
            track.spotify_popularity_updated_at = datetime.utcnow()
        if result.get('preview_url'):
            track.spotify_preview_url = result['preview_url']
        db.session.commit()

    return result


def create_playlist(user_id: int, track_ids: List[int], playlist_name: str) -> Dict:
    """Create a Spotify playlist."""
    client = SpotifyClient(user_id)
    return client.create_playlist(track_ids, playlist_name)


def get_spotify_status(user_id: int = None) -> Dict:
    """Get current Spotify integration status."""
    configured = is_spotify_configured()
    authenticated = False

    if user_id and configured:
        user = User.query.get(user_id)
        authenticated = bool(user and user.spotify_access_token)

    return {
        'enabled': configured,
        'mock_mode': not configured,
        'authenticated': authenticated,
        'status': (
            'active' if authenticated else
            ('configured' if configured else 'pending')
        ),
        'message': (
            'Connected to Spotify' if authenticated else
            ('Spotify configured - connect your account' if configured else
             'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in environment')
        ),
        'features_available': {
            'search': configured,
            'playlist_creation': authenticated,
            'audio_features': configured,
            'popularity': configured
        }
    }


def export_for_spotify(track_ids: List[int], format: str = 'json') -> Dict:
    """Export tracks in a format suitable for manual Spotify import."""
    tracks = Track.query.filter(Track.id.in_(track_ids)).all()

    export_data = []
    for track in tracks:
        export_data.append({
            'name': track.name,
            'artist': track.artist.name if track.artist else 'Unknown',
            'album': track.album.name if track.album else None,
            'search_query': f"{track.name} - {track.artist.name if track.artist else ''}",
            'lastfm_url': track.url,
            'spotify_uri': track.spotify_uri
        })

    if format == 'text':
        lines = [f"{t['name']} - {t['artist']}" for t in export_data]
        return {
            'format': 'text',
            'content': '\n'.join(lines),
            'track_count': len(lines)
        }

    return {
        'format': 'json',
        'tracks': export_data,
        'track_count': len(export_data),
        'instructions': 'Search each track on Spotify to add to your playlist'
    }
