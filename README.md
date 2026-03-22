# 🗺️ Spotyy — India Place Finder & Navigation

A full-stack dark-themed web app to discover and navigate to places near you across India.

---

## 📁 Project Structure

```
spotyy/
├── public/
│   ├── index.html      ← Login page (with rope animation)
│   └── app.html        ← Main app (map + places finder)
├── server.js           ← Express backend
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
npm start
# or for development with auto-reload:
npm run dev
```

### 3. Open in browser
```
http://localhost:3000
```

---

## 🔐 Auth Flow

- **Register** with name, email & password  
- **Login** returns a JWT token (7-day expiry)  
- Token stored in `localStorage`, sent as `Bearer` header on API calls  
- Protected routes return `401` if token missing/invalid  

> ⚠️ Users are stored **in-memory** by default. For production, connect MongoDB or PostgreSQL and replace the `users` array in `server.js`.

---

## 🗺️ Features

| Feature | Details |
|---|---|
| 🔑 Auth | Email + password, JWT, bcrypt hashing |
| 📍 Live Location | Browser geolocation API |
| 🗺️ Interactive Map | Leaflet.js + OpenStreetMap tiles |
| 🛰️ Satellite View | Esri World Imagery toggle |
| 🔍 Category Filter | 8 place types via OSM Overpass API |
| 🔎 Text Search | Nominatim geocoding (India only) |
| 🧭 Navigation | Route line with distance & ETA |
| 📱 Mobile Ready | Responsive layout |
| 🌙 Dark Theme | Full dark UI with amber accent |
| 🕯️ Rope Animation | On login page background |

---

## 🔌 API Endpoints

### Auth
| Method | Route | Body | Description |
|---|---|---|---|
| POST | `/api/auth/register` | `{name, email, password}` | Create account |
| POST | `/api/auth/login` | `{email, password}` | Sign in |
| GET | `/api/auth/me` | — (JWT) | Get current user |

### Places
| Method | Route | Params | Description |
|---|---|---|---|
| GET | `/api/places/nearby` | `lat, lon, type, radius` | Nearby places |
| GET | `/api/places/search` | `q, lat, lon, radius` | Text search (global + nearby priority) |

### Place Types
`all` · `restaurant` · `tourist_attraction` · `lodging` · `hospital` · `gas_station` · `atm` · `shopping_mall` · `hindu_temple`

---

## 🌐 Third-Party Services Used

- **OpenStreetMap Overpass API** — place data (free, no key needed)  
- **Nominatim** — reverse geocoding & search (free, no key needed)  
- **Leaflet.js** — interactive maps  
- **Esri World Imagery** — satellite tiles  

---

## ⚙️ Environment Variables

```env
PORT=3000
JWT_SECRET=your_secret_key_here
```

---

## 🏗️ Production Checklist

- [ ] Replace in-memory user store with a real database (MongoDB / PostgreSQL)
- [ ] Set a strong `JWT_SECRET` via environment variables
- [ ] Add rate limiting (`express-rate-limit`)
- [ ] Add HTTPS (use a reverse proxy like Nginx)
- [ ] Add input sanitization / validation library (`zod` / `joi`)
