export default async function handler(req, res) {
  // Allow your frontend to talk to this backend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;

    // 1. Verify environment variables exist
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
      return res.status(500).json({ error: 'Missing environment variables in Vercel' });
    }

    // 2. Fetch a fresh access token
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: SPOTIFY_REFRESH_TOKEN
      }).toString(),
    });

    // Check if the token request failed before parsing JSON
    if (!tokenRes.ok) {
      return res.status(tokenRes.status).json({ error: 'Failed to authenticate with Spotify' });
    }

    const tokenData = await tokenRes.json();
    const access_token = tokenData.access_token;

    // 3. Check what is currently playing
    const nowRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (nowRes.status === 200) {
      const data = await nowRes.json();
      if (data.is_playing) {
        return res.status(200).json({
          isPlaying: true,
          title: data.item.name,
          artist: data.item.artists.map(a => a.name).join(', '),
          album: data.item.album.name,
          albumArt: data.item.album.images[1].url || data.item.album.images[0].url,
          songUrl: data.item.external_urls.spotify,
        });
      }
    } else if (nowRes.status === 429) {
      // Handle the rate limit gracefully
      return res.status(429).json({ error: 'Rate limited by Spotify. Try again later.' });
    }

    // 4. Fallback: Fetch most recently played track
    const recentRes = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=1', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!recentRes.ok) {
      return res.status(recentRes.status).json({ error: 'Failed to fetch recently played track' });
    }

    const recentData = await recentRes.json();
    const track = recentData.items[0].track;

    return res.status(200).json({
      isPlaying: false,
      title: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      album: track.album.name,
      albumArt: track.album.images[1].url || track.album.images[0].url,
      songUrl: track.external_urls.spotify,
    });

  } catch (err) {
    // Catch any remaining unexpected errors to prevent a total server crash
    return res.status(500).json({ error: err.message });
  }
}