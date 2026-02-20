# SADO Game Voice

Lightweight, real-time voice chat for gaming parties. Built with **Electron + React + LiveKit**.

## Architecture

| Layer | Tech | Path |
|-------|------|------|
| Desktop App | Electron + Vite + React + TypeScript | `apps/desktop/` |
| Backend API | Node.js + Express 5 | `apps/server/` |
| Voice Engine | LiveKit (WebRTC) | Self-hosted / Cloud |

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
| `apps/server/src/index.ts` | Express API: token gen, room list, custom channels, PIN verify |

## API Endpoints (Server)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/health` | Health check |
| POST | `/api/token` | Generate LiveKit token (`username`, `room`, `deviceId`) |
| GET | `/api/rooms` | List all channels with player counts (default + custom) |
| POST | `/api/channels` | Create custom channel (`name`, `pin?`, `createdBy`) |
| POST | `/api/channels/verify-pin` | Verify PIN for locked channel |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_SERVER_URL` | `http://localhost:3001` | Backend API URL |
| `LIVEKIT_API_KEY` | `devkey` | LiveKit API key |
| `LIVEKIT_API_SECRET` | `devsecret` | LiveKit API secret |
| `LIVEKIT_URL` | `ws://localhost:7880` | LiveKit WebSocket URL |
| `LIVEKIT_HTTP_URL` | `http://localhost:7880` | LiveKit HTTP URL (room service) |

## Running Locally

```bash
# Terminal 1 — Server
pnpm --filter server dev

# Terminal 2 — Desktop App
pnpm --filter desktop dev
```

## Upcoming / TODO

- [ ] Integration testing with real LiveKit
- [ ] Build & distribution (Mac `.dmg` / Windows `.exe` via `electron-builder`)
- [ ] Push-to-talk mode
- [ ] Noise suppression (Krisp-style)
