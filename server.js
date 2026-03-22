// ═══════════════════════════════════════════════════════
//  Spotyy Backend — server.js
//  Node.js + Express | JWT Auth | Places API (Overpass)
// ═══════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'spotyy_super_secret_key_change_in_prod';

// ── Middleware ────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory User Store (replace with MongoDB/PostgreSQL in prod) ──
const users = [];

// ── Auth Middleware ───────────────────────────────────
function authMiddleware(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const token = auth.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// ════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields are required.' });

    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ message: 'Invalid email address.' });

    const exists = users.find(u => u.email === email.toLowerCase());
    if (exists)
      return res.status(409).json({ message: 'Email already registered.' });

    const hash = await bcrypt.hash(password, 10);
    const user = {
      id: Date.now().toString(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hash,
      createdAt: new Date().toISOString()
    };
    users.push(user);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required.' });

    const user = users.find(u => u.email === email.toLowerCase().trim());
    if (!user)
      return res.status(401).json({ message: 'No account found with this email.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ message: 'Incorrect password.' });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful.',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/social — demo OAuth: one account per provider (no external keys required)
const SOCIAL_PROVIDERS = ['google', 'facebook', 'github', 'linkedin'];

app.post('/api/auth/social', async (req, res) => {
  try {
    const provider = String(req.body.provider || '').toLowerCase();
    if (!SOCIAL_PROVIDERS.includes(provider)) {
      return res.status(400).json({ message: 'Unsupported provider.' });
    }

    const email = `oauth_${provider}@spotyy.local`;
    const name =
      provider === 'google'
        ? 'Google User'
        : provider === 'facebook'
          ? 'Facebook User'
          : provider === 'github'
            ? 'GitHub User'
            : 'LinkedIn User';

    let user = users.find(u => u.email === email);
    if (!user) {
      const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      user = {
        id: `soc_${provider}_${Date.now()}`,
        name,
        email,
        password: hash,
        provider,
        createdAt: new Date().toISOString()
      };
      users.push(user);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Signed in.',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Social auth error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.json({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt });
});

// ════════════════════════════════════════════════════════
//  PLACES ROUTES  (uses OpenStreetMap Overpass API)
// ════════════════════════════════════════════════════════

// Maps our category keys to OpenStreetMap tags
const OSM_TAG_MAP = {
  restaurant:          '[amenity=restaurant]',
  tourist_attraction:  '[tourism~"attraction|museum|monument|viewpoint"]',
  lodging:             '[tourism~"hotel|guest_house|hostel"]',
  hospital:            '[amenity~"hospital|clinic|doctors"]',
  gas_station:         '[amenity=fuel]',
  atm:                 '[amenity=atm]',
  shopping_mall:       '[shop~"mall|supermarket|department_store"]',
  hindu_temple:        '[amenity=place_of_worship][religion=hindu]',
  all:                 '[amenity~"restaurant|fuel|atm|hospital|place_of_worship"][name]',
};

const EMOJI_MAP = {
  restaurant: '🍽️', hotel: '🏨', guest_house: '🏨', hostel: '🏨',
  hospital: '🏥', clinic: '🏥', doctors: '🏥',
  fuel: '⛽', atm: '🏧',
  attraction: '📸', museum: '📸', monument: '📸', viewpoint: '📸',
  mall: '🛍️', supermarket: '🛒', department_store: '🛍️',
  place_of_worship: '🛕',
  default: '📍'
};

const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const searchCache = new Map();

// GET /api/places/nearby?lat=&lon=&type=&radius=
app.get('/api/places/nearby', authMiddleware, async (req, res) => {
  const { lat, lon, type = 'all', radius = 3000 } = req.query;

  if (!lat || !lon)
    return res.status(400).json({ message: 'lat and lon are required.' });

  const latF = parseFloat(lat);
  const lonF = parseFloat(lon);

  // Validate India bounding box (rough)
  if (latF < 6 || latF > 37 || lonF < 68 || lonF > 98)
    return res.status(400).json({ message: 'Location must be within India.' });

  const tag = OSM_TAG_MAP[type] || OSM_TAG_MAP.all;
  const r = parseInt(radius) || 3000;

  const query = `
    [out:json][timeout:25];
    (
      node${tag}(around:${r},${latF},${lonF});
      way${tag}(around:${r},${latF},${lonF});
    );
    out center 30;
  `;

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) throw new Error('Overpass API error');

    const data = await response.json();
    const places = data.elements
      .filter(e => e.tags?.name)
      .map(e => {
        const pLat = e.lat || e.center?.lat;
        const pLon = e.lon || e.center?.lon;
        const distance = pLat && pLon ? Math.round(haversine(latF, lonF, pLat, pLon)) : null;
        const subtype = e.tags.amenity || e.tags.tourism || e.tags.shop || 'default';
        return {
          id: e.id,
          name: e.tags.name,
          addr: [e.tags['addr:housenumber'], e.tags['addr:street'], e.tags['addr:city']]
            .filter(Boolean).join(', ') || e.tags['addr:full'] || '',
          type: type === 'all' ? subtype : type,
          emoji: EMOJI_MAP[subtype] || EMOJI_MAP.default,
          lat: pLat,
          lon: pLon,
          distance,
          open: e.tags.opening_hours ? null : true, // simplified
          rating: null,
          website: e.tags.website || null,
          phone: e.tags.phone || e.tags['contact:phone'] || null,
        };
      })
      .filter(p => p.lat && p.lon)
      .sort((a, b) => (a.distance || 9999) - (b.distance || 9999));

    res.json({ places, total: places.length, source: 'openstreetmap' });

  } catch (err) {
    console.error('Places fetch error:', err.message);
    res.status(503).json({ message: 'Could not fetch places. Try again shortly.', places: [] });
  }
});

// GET /api/places/search?q=&lat=&lon=
app.get('/api/places/search', authMiddleware, async (req, res) => {
  const { q, lat, lon, radius = 50000, limit = 8 } = req.query;
  if (!q) return res.status(400).json({ message: 'Search query required.' });

  try {
    const hasCoords = lat !== undefined && lon !== undefined;
    const latF = hasCoords ? parseFloat(lat) : null;
    const lonF = hasCoords ? parseFloat(lon) : null;

    if (hasCoords && (Number.isNaN(latF) || Number.isNaN(lonF))) {
      return res.status(400).json({ message: 'lat and lon must be valid numbers.' });
    }

    const safeRadius = Math.min(Math.max(parseInt(radius, 10) || 50000, 1000), 200000);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 20);
    const cacheKey = JSON.stringify({
      q: String(q).trim().toLowerCase(),
      lat: hasCoords ? latF.toFixed(4) : null,
      lon: hasCoords ? lonF.toFixed(4) : null,
      radius: safeRadius,
      limit: safeLimit
    });
    const now = Date.now();
    const cached = searchCache.get(cacheKey);
    if (cached && now - cached.ts < SEARCH_CACHE_TTL_MS) {
      return res.json({ ...cached.payload, cached: true });
    }

    const baseParams = new URLSearchParams({
      q: String(q).trim(),
      format: 'json',
      addressdetails: '1',
      limit: String(safeLimit)
    });

    const trySearch = async (bounded, nominatimLimit) => {
      const params = new URLSearchParams(baseParams);
      const lim = Math.min(Math.max(parseInt(nominatimLimit, 10) || safeLimit, 1), 40);
      params.set('limit', String(lim));
      if (hasCoords && bounded) {
        const latDelta = safeRadius / 111320;
        const cosLat = Math.max(Math.cos((latF * Math.PI) / 180), 0.01);
        const lonDelta = safeRadius / (111320 * cosLat);
        const left = lonF - lonDelta;
        const right = lonF + lonDelta;
        const top = latF + latDelta;
        const bottom = latF - latDelta;
        // Nominatim: viewbox = two corners, x=lon y=lat (e.g. NW and SE)
        params.set('viewbox', `${left},${top},${right},${bottom}`);
        params.set('bounded', '1');
      }
      const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Spotyy/1.0',
          'Accept-Language': 'en'
        },
        signal: AbortSignal.timeout(15000)
      });
      if (!r.ok) throw new Error(`Nominatim search error (${r.status})`);
      return r.json();
    };

    const mapNominatim = (arr) =>
      (Array.isArray(arr) ? arr : []).map((item, i) => ({
        id: i,
        name: item.display_name.split(',')[0],
        addr: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        type: item.type,
        emoji: '📍',
        distance: hasCoords
          ? Math.round(haversine(latF, lonF, parseFloat(item.lat), parseFloat(item.lon)))
          : null
      })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

    let scope = 'global';
    let raw;

    if (!hasCoords) {
      raw = await trySearch(false, safeLimit);
    } else {
      const wideLimit = Math.min(40, Math.max(safeLimit * 5, 20));
      raw = await trySearch(true, wideLimit);
      if (!Array.isArray(raw) || raw.length === 0) {
        raw = await trySearch(false, safeLimit);
        scope = 'global';
      } else {
        scope = 'nearby';
      }
    }

    let places = mapNominatim(raw);

    // viewbox is a rectangle; corners extend beyond a true circle — keep only haversine distance <= radius
    if (hasCoords && scope === 'nearby') {
      places = places.filter(p => p.distance != null && p.distance <= safeRadius);
      if (places.length === 0) {
        raw = await trySearch(false, safeLimit);
        scope = 'global';
        places = mapNominatim(raw);
      }
    }

    if (hasCoords) {
      places.sort((a, b) => (a.distance ?? Number.MAX_SAFE_INTEGER) - (b.distance ?? Number.MAX_SAFE_INTEGER));
    }

    places = places.slice(0, safeLimit).map((p, i) => ({ ...p, id: i }));

    const payload = { places, total: places.length, scope };
    searchCache.set(cacheKey, { ts: now, payload });

    if (searchCache.size > 200) {
      const oldestKey = searchCache.keys().next().value;
      if (oldestKey) searchCache.delete(oldestKey);
    }

    res.json(payload);
  } catch (err) {
    res.status(503).json({ message: 'Search failed.', places: [] });
  }
});

// ── Haversine helper ──────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Catch-all → index.html ────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════╗
  ║   🗺️  Spotyy Server Running       ║
  ║   http://localhost:${PORT}          ║
  ╚══════════════════════════════════╝
  `);
});

module.exports = app;
