# GamerScream

Lightweight, real-time voice chat for gaming parties. Built with **Electron + React + LiveKit**.

## Architecture

| Layer | Tech | Path |
|-------|------|------|
| Desktop App | Electron + Vite + React + TypeScript | `apps/desktop/` |
| Backend API | Node.js + Express 5 | `apps/server/` |
| Voice Engine | LiveKit (WebRTC) | Self-hosted on Oracle Cloud VM |
| Landing Page | Next.js | `GamerScream-web/` |

**Monorepo** managed with `pnpm workspaces`.

## Core Features

### Voice Chat
- Connect to numbered channels (`ch-1` through `ch-5`) with one click
- Real-time voice via LiveKit WebRTC
- Mute/unmute self, visual speaking indicators (green pulse dots)

### Custom Channels
- Create named channels with optional **4-digit PIN** protection
- Lock icon (🔒) displayed on PIN-protected channels
- PIN entry dialog when joining locked channels
- Auto-created, auto-deleted when all participants leave (10s grace period)
- Server stores custom channels in-memory (`Map<string, CustomChannel>`)

### App-Level PIN Gate
- **PIN 1520** required on first launch or new device
- HMAC-based access token generated server-side, stored in `localStorage`
- All API endpoints protected via `x-access-token` header
- PIN never exposed to the client — validated server-side only

### Per-Player Volume Control
- Individual volume sliders per remote participant (0–100%, step 5)
- **Master channel volume** slider to adjust all remote players at once
- **Mute All / Unmute All** toggle button on master slider row
- Volume settings **persist per device** (UUID stored in `localStorage`)
- Device ID sent as LiveKit token metadata—survives username changes

### Audio Device Management
- Microphone selector with level slider (step 5)
- Speaker/output device selector
- Settings persist in `localStorage`

### Session Management
- Auto-connect toggle (remembers last channel on launch)
- Channel list with live player counts (polled every 5s)
- Connection status, room name display

## UI/UX

- **Dark theme** with glassmorphism cards
- **Icons**: `lucide-react` (no emojis)
- **Toggles**: CSS-only modern toggle switches
- **Dialogs**: Overlay modals for channel creation & PIN entry
- Zinc-tone separators, smooth transitions

## Key Files

| File | Purpose |
|------|---------|
| `apps/desktop/src/renderer/App.tsx` | Main app shell, state wiring |
| `apps/desktop/src/renderer/hooks/useLiveKit.ts` | LiveKit connection, volumes, channels, mute logic |
| `apps/desktop/src/renderer/hooks/useSettings.ts` | localStorage settings persistence |
| `apps/desktop/src/renderer/hooks/useAudioDevices.ts` | Mic/speaker enumeration |
| `apps/desktop/src/renderer/components/SessionControls.tsx` | Channel list, player list, volume controls, dialogs |
| `apps/desktop/src/renderer/components/MicrophoneSelector.tsx` | Mic picker + level slider |
| `apps/desktop/src/renderer/components/SpeakerSelector.tsx` | Speaker picker |
| `apps/desktop/src/renderer/components/UsernameEntry.tsx` | Name entry screen |
| `apps/desktop/src/renderer/styles/index.css` | All styles (dark theme, cards, dialogs, sliders) |
| `apps/desktop/src/renderer/types/index.ts` | Shared TypeScript interfaces |
| `apps/server/src/index.ts` | Express API: token gen, room list, custom channels, PIN verify, access control |
| `apps/desktop/src/renderer/components/PinEntry.tsx` | PIN entry screen (first launch) |

## API Endpoints (Server)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/health` | Health check |
| POST | `/api/token` | Generate LiveKit token (`username`, `room`, `deviceId`) |
| GET | `/api/rooms` | List all channels with player counts (default + custom) |
| POST | `/api/channels` | Create custom channel (`name`, `pin?`, `createdBy`) |
| POST | `/api/channels/verify-pin` | Verify PIN for locked channel |
| POST | `/api/verify-pin` | Verify app-level PIN, return access token |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_SERVER_URL` | `http://localhost:3002` | Backend API URL |
| `LIVEKIT_API_KEY` | `devkey` | LiveKit API key |
| `LIVEKIT_API_SECRET` | `devsecret` | LiveKit API secret |
| `LIVEKIT_URL` | `ws://localhost:7880` | LiveKit WebSocket URL (server-side) |
| `LIVEKIT_HTTP_URL` | `http://localhost:7880` | LiveKit HTTP URL (room service) |
| `LIVEKIT_CLIENT_URL` | `= LIVEKIT_URL` | LiveKit URL returned to clients (external-facing) |
| `APP_PIN` | `1520` | App-level PIN for access |
| `TOKEN_SECRET` | derived | HMAC secret for access tokens |

## Running Locally

```bash
# Terminal 1 — Server
pnpm --filter server dev

# Terminal 2 — Desktop App
pnpm --filter desktop dev
```

## Production Deployment

| Component | Detail |
|-----------|--------|
| **VM** | Oracle Cloud Always Free — VM.Standard.E2.1.Micro (1 OCPU, 1 GB RAM) |
| **Region** | Germany Central (Frankfurt) |
| **OS** | Ubuntu 22.04 |
| **Public IP** | `144.24.183.24` |
| **Domain** | `gamerscream.duckdns.org` |
| **HTTPS** | Auto via Caddy + Let's Encrypt |
| **API URL** | `https://gamerscream.duckdns.org/api/health` |
| **LiveKit WS** | `ws://144.24.183.24:7880` |

Services run as `systemd` units (auto-restart on failure, auto-start on reboot):
- `livekit.service` — LiveKit server
- `gamerscream.service` — Node.js backend API
- `caddy.service` — HTTPS reverse proxy

### Deploy / Redeploy

```bash
# SSH
ssh -i apps/desktop/build/ssh-key-2026-02-20.key ubuntu@144.24.183.24

# Redeploy backend
cd apps/server && npm run build
scp -i apps/desktop/build/ssh-key-2026-02-20.key -r dist/* ubuntu@144.24.183.24:~/gamerscream/dist/
ssh -i apps/desktop/build/ssh-key-2026-02-20.key ubuntu@144.24.183.24 "sudo systemctl restart gamerscream"
```

## Distribution

- **Mac**: `.dmg` via `electron-builder` → GitHub Releases
- **Windows**: `.exe` via `electron-builder` → GitHub Releases
- **Landing page**: [gamerscream.vercel.app](https://gamerscream.vercel.app) with download links

## Upcoming / TODO

- [ ] Push-to-talk mode
- [ ] Noise suppression (Krisp-style)
- [ ] DuckDNS cron job for dynamic IP updates
- [x] ~~Build & distribution (Mac `.dmg` / Windows `.exe`)~~
- [x] ~~App-level PIN gate~~
- [x] ~~Production deployment (Oracle Cloud VM)~~
