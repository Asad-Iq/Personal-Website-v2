export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;

  // Get a fresh access token
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: `grant_type=refresh_token&refresh_token=${SPOTIFY_REFRESH_TOKEN}`,
  });

  const { access_token } = await tokenRes.json();

  // Try currently playing first
  const nowRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (nowRes.status === 200) {
    const data = await nowRes.json();
    if (data.is_playing) {
      return res.json({
        isPlaying: true,
        title: data.item.name,
        artist: data.item.artists.map(a => a.name).join(', '),
        album: data.item.album.name,
        albumArt: data.item.album.images[1].url,
        songUrl: data.item.external_urls.spotify,
      });
    }
  }

  // Fallback: most recently played
  const recentRes = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=1', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const recentData = await recentRes.json();
  const track = recentData.items[0].track;

  return res.json({
    isPlaying: false,
    title: track.name,
    artist: track.artists.map(a => a.name).join(', '),
    album: track.album.name,
    albumArt: track.album.images[1].url,
    songUrl: track.external_urls.spotify,
  });
}
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
      return res.status(500).json({ error: 'Missing env vars', has: { SPOTIFY_CLIENT_ID: !!SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET: !!SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN: !!SPOTIFY_REFRESH_TOKEN } });
    }

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: `grant_type=refresh_token&refresh_token=${SPOTIFY_REFRESH_TOKEN}`,
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.status(500).json({ error: 'No access token', tokenData });
    }

    const access_token = tokenData.access_token;

    const nowRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (nowRes.status === 200) {
      const data = await nowRes.json();
      if (data.is_playing) {
        return res.json({
          isPlaying: true,
          title: data.item.name,
          artist: data.item.artists.map(a => a.name).join(', '),
          album: data.item.album.name,
          albumArt: data.item.album.images[1].url,
          songUrl: data.item.external_urls.spotify,
        });
      }
    }

    const recentRes = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=1', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const recentData = await recentRes.json();
    const track = recentData.items[0].track;

    return res.json({
      isPlaying: false,
      title: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      album: track.album.name,
      albumArt: track.album.images[1].url,
      songUrl: track.external_urls.spotify,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}