import { useState, useCallback, useEffect, useRef } from 'react'
import { MicrophoneSelector } from './components/MicrophoneSelector'
import { SpeakerSelector } from './components/SpeakerSelector'
import { SessionControls } from './components/SessionControls'
import { UsernameEntry } from './components/UsernameEntry'
import { ToastContainer, useToast } from './components/Toast'
import { useAudioDevices } from './hooks/useAudioDevices'
import { useLiveKit } from './hooks/useLiveKit'
import { useSettings } from './hooks/useSettings'
import { playJoinSound, playLeaveSound, setSoundOutputDevice } from './utils/sounds'
import { JOIN_SOUNDS, playJoinSoundById, setJoinSoundSpeaker } from './utils/joinSounds'
import { User, Download, ShieldCheck, Mic, Bell } from 'lucide-react'
import logoSvg from './assets/logo.svg'

import { AdminPanel } from './components/AdminPanel'

const APP_VERSION = '2.6'

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3002'

// Human-readable key names from keyboard event codes
function formatKeyName(code: string): string {
    const map: Record<string, string> = {
        Backquote: '~', '`': '~', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
        CapsLock: 'Caps Lock', Tab: 'Tab', Space: 'Space',
        ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', Shift: 'Shift',
        ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', Control: 'Ctrl',
        AltLeft: 'L-Alt', AltRight: 'R-Alt', Alt: 'Alt',
    }
    if (map[code]) return map[code]
    if (code.startsWith('Key')) return code.slice(3)
    if (code.startsWith('Digit')) return code.slice(5)
    return code
}

// Convert browser e.code to Electron accelerator format
function codeToAccelerator(code: string): string {
    const map: Record<string, string> = {
        Backquote: '`', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
        Minus: '-', Equal: '=', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
        CapsLock: 'CapsLock', Tab: 'Tab', Space: 'Space', Escape: 'Escape',
        Enter: 'Enter', Backspace: 'Backspace', Delete: 'Delete',
        ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
        ShiftLeft: 'Shift', ShiftRight: 'Shift',
        ControlLeft: 'Control', ControlRight: 'Control',
        AltLeft: 'Alt', AltRight: 'Alt',
        MetaLeft: 'Meta', MetaRight: 'Meta',
    }
    if (map[code]) return map[code]
    if (code.startsWith('Key')) return code.slice(3)
    if (code.startsWith('Digit')) return code.slice(5)
    if (code.startsWith('F') && code.length <= 3) return code // F1-F12
    if (code.startsWith('Numpad')) return 'num' + code.slice(6)
    return code
}

export default function App() {
    const { settings, updateSetting } = useSettings()
    const {
        microphones, speakers, selectedMic, setSelectedMic,
        selectedSpeaker, setSelectedSpeaker, micLevel, setMicLevel
    } = useAudioDevices()

    const { toasts, addToast } = useToast()

    // Access token state — MUST be declared before useLiveKit to gate polling
    const [accessVerified, setAccessVerified] = useState(false)
    const [checkingAccess, setCheckingAccess] = useState(true)
    const [showAdmin, setShowAdmin] = useState(false)

    // Synth beep for mute toggle feedback (Web Audio API — no file dependency)
    // Defined before useLiveKit because it's used in onParticipantMute/onParticipantUnmute callbacks
    const playMuteBeep = useCallback((muting: boolean) => {
        try {
            const ctx = new AudioContext()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.frequency.value = muting ? 300 : 600 // Low = mute, High = unmute
            gain.gain.value = 0.08
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
            osc.start()
            osc.stop(ctx.currentTime + 0.15)
            osc.onended = () => ctx.close()
        } catch { /* ignore audio context failures */ }
    }, [])

    const {
        isConnected, isConnecting, isReconnecting, isMuted, isVadGateOpen, allMuted, players, roomName, channels,
        rnnoiseActive, connect, disconnect, cancelReconnect, toggleMute, setMuted, toggleMuteAll, setPlayerVolume,
        createChannel, verifyPin, setMicGain, setNoiseSuppressionLevel, getRawMicLevel, setVadGate, setVadActive,
        setSpeakerDevice, updateInputModeMetadata
    } = useLiveKit({
        onParticipantJoin: (name) => {
            playJoinSound()
            addToast(`${name} joined`, 'join')
            // OS-level native notification
            window.electronAPI?.showNotification?.('GamerScream', `${name} joined the channel`)
        },
        onParticipantLeave: (name) => {
            playLeaveSound()
            addToast(`${name} left`, 'leave')
            window.electronAPI?.showNotification?.('GamerScream', `${name} left the channel`)
        },
        onParticipantMute: (name) => {
            playMuteBeep(true)
            addToast(`${name} muted`, 'leave')
            window.electronAPI?.showNotification?.('GamerScream', `🔇 ${name} muted`)
        },
        onParticipantUnmute: (name) => {
            playMuteBeep(false)
            addToast(`${name} unmuted`, 'join')
            window.electronAPI?.showNotification?.('GamerScream', `🎤 ${name} unmuted`)
        },
        // [P2-1] Token expired — clear and show PIN screen
        onAuthExpired: () => {
            window.electronAPI?.removeStoredToken?.()
            window.__gamerScreamAccessToken = undefined
            setAccessVerified(false)
        }
    }, accessVerified)  // ← Gate polling on accessVerified

    // Ref to track mute state for the global key handler (which can't read React state)
    const isMutedRef = useRef(isMuted)
    isMutedRef.current = isMuted

    const [hasEnteredName, setHasEnteredName] = useState(!!settings.username)

    // Sync hasEnteredName when settings recover from file (macOS async recovery)
    useEffect(() => {
        if (settings.username) setHasEnteredName(true)
    }, [settings.username])

    const [connectError, setConnectError] = useState<string | null>(null)

    const [recordingKeybind, setRecordingKeybind] = useState(false)
    const [recordingMuteKeybind, setRecordingMuteKeybind] = useState(false)
    const pttActiveRef = useRef(false) // Track PTT key state to prevent repeated fires
    const [activeTab, setActiveTab] = useState<'channels' | 'settings'>('channels')

    // [P3-2] Auto-dismiss error banner after 5 seconds
    useEffect(() => {
        if (!connectError) return
        const t = setTimeout(() => setConnectError(null), 5000)
        return () => clearTimeout(t)
    }, [connectError])

    // Auto-update state
    const [updateVersion, setUpdateVersion] = useState<string | null>(null)
    const [updateReady, setUpdateReady] = useState(false)

    // Listen for auto-update events from main process
    useEffect(() => {
        const api = window.electronAPI
        if (!api?.onUpdateAvailable) return
        api.onUpdateAvailable((info: { version: string }) => {
            setUpdateVersion(info.version.replace(/\.0$/, ''))
        })
        api.onUpdateDownloaded((info: { version: string }) => {
            setUpdateVersion(info.version.replace(/\.0$/, ''))
            setUpdateReady(true)
        })
    }, [])

    // On mount: check if stored access token is still valid
    useEffect(() => {
        (async () => {
            const stored = await window.electronAPI?.getStoredToken?.() || null
            if (!stored) {
                setCheckingAccess(false)
                return
            }
            try {
                const r = await fetch(`${SERVER_URL}/api/verify-access-token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accessToken: stored })
                })
                const data = await r.json()
                if (data.valid) {
                    setAccessVerified(true)
                    window.__gamerScreamAccessToken = stored
                } else {
                    window.electronAPI?.removeStoredToken?.()
                }
            } catch {
                // Server unreachable — trust the stored token
                setAccessVerified(true)
                window.__gamerScreamAccessToken = stored
            } finally {
                setCheckingAccess(false)
            }
        })()
    }, [])

    const handlePinSubmit = async (pin: string): Promise<boolean | string> => {
        try {
            const res = await fetch(`${SERVER_URL}/api/verify-app-pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
            })
            if (!res.ok) return false
            const data = await res.json()
            if (data.accessToken) {
                await window.electronAPI?.setStoredToken?.(data.accessToken)
                window.__gamerScreamAccessToken = data.accessToken
                setAccessVerified(true)
                return true
            }
            return false
        } catch (err) {
            console.error('[PIN] Server unreachable:', err)
            return 'Server unreachable — check your connection'
        }
    }

    useEffect(() => {
        if (settings.microphoneId && microphones.some((m) => m.deviceId === settings.microphoneId)) {
            setSelectedMic(settings.microphoneId)
        }
    }, [settings.microphoneId, microphones, setSelectedMic])

    useEffect(() => {
        if (settings.speakerId && speakers.some((s) => s.deviceId === settings.speakerId)) {
            setSelectedSpeaker(settings.speakerId)
            setSpeakerDevice(settings.speakerId) // Sync LiveKit audio output
            setSoundOutputDevice(settings.speakerId) // Sync notification sounds
        }
    }, [settings.speakerId, speakers, setSelectedSpeaker, setSpeakerDevice])

    // Sync join sound speaker device on load
    useEffect(() => {
        if (settings.speakerId) {
            setJoinSoundSpeaker(settings.speakerId)
        }
    }, [settings.speakerId])



    // Mode transition: handle mute/unmute and gate state on connect or mode switch
    useEffect(() => {
        if (isConnected && settings.inputMode === 'ptt') {
            setMuted(true)
        }
        if (isConnected && settings.inputMode === 'vad') {
            // Unmute mic — VAD controls audio via gain gate, not mute
            if (isMuted) setMuted(false)
            setVadGate(false) // Start with gate closed, opens when voice detected
        }
        if (isConnected && settings.inputMode === 'voice') {
            if (isMuted) setMuted(false)
            setVadGate(true) // Fully open gate for voice mode
        }
        // Reset all mode state on disconnect
        if (!isConnected) {
            pttActiveRef.current = false
            setVadActive(false)
            setVadGate(true)
        }
    }, [isConnected, settings.inputMode]) // eslint-disable-line react-hooks/exhaustive-deps

    // Update participant metadata when inputMode changes while connected
    useEffect(() => {
        if (isConnected) {
            updateInputModeMetadata(settings.inputMode)
        }
    }, [isConnected, settings.inputMode, updateInputModeMetadata])

    // VAD: Voice Activity Detection — poll raw mic level and control gain gate
    useEffect(() => {
        if (settings.inputMode !== 'vad' || !isConnected) return

        // Tell the hook that VAD is now controlling gain
        setVadActive(true)
        setVadGate(false) // Ensure gate starts closed (prevents flash from cleanup)

        const threshold = settings.vadThreshold / 100 // Convert 0-100 to 0-1
        let holdTimer: ReturnType<typeof setTimeout> | null = null
        let isOpen = false

        const interval = setInterval(() => {
            const level = getRawMicLevel()

            if (level > threshold) {
                // Voice detected — open gate
                if (!isOpen) {
                    isOpen = true
                    setVadGate(true)
                }
                // Reset hold timer
                if (holdTimer) {
                    clearTimeout(holdTimer)
                    holdTimer = null
                }
            } else if (isOpen && !holdTimer) {
                // Below threshold — start hold timer before closing
                holdTimer = setTimeout(() => {
                    isOpen = false
                    setVadGate(false)
                    holdTimer = null
                }, 250) // 250ms hold time
            }
        }, 50) // Poll every 50ms

        return () => {
            clearInterval(interval)
            if (holdTimer) clearTimeout(holdTimer)
            // Restore gain and release VAD control when leaving VAD mode
            setVadActive(false)
            setVadGate(true)
        }
    }, [settings.inputMode, settings.vadThreshold, isConnected, getRawMicLevel, setVadGate, setVadActive])

    // Removed: mode switch auto-unmute is now handled by the unified mode transition effect above

    // Keep refs for values used in PTT handlers to avoid effect re-runs on mute changes
    const isConnectedRef = useRef(isConnected)
    isConnectedRef.current = isConnected
    const setMutedRef = useRef(setMuted)
    setMutedRef.current = setMuted

    // PTT: Unified focus-aware push-to-talk
    // When focused: use renderer keydown/keyup (perfect key-up detection for all keys)
    // When blurred: use globalShortcut + timer (works in background, slight delay on release)
    useEffect(() => {
        if (settings.inputMode !== 'ptt') {
            window.electronAPI?.unregisterPttKey?.()
            return
        }

        const accelerator = codeToAccelerator(settings.pttKey)

        const handlePttDown = () => {
            if (!pttActiveRef.current && isConnectedRef.current) {
                pttActiveRef.current = true
                setMutedRef.current(false)
            }
        }

        const handlePttUp = () => {
            if (pttActiveRef.current) {
                pttActiveRef.current = false
                setMutedRef.current(true)
            }
        }

        // --- Renderer key events (used when focused) ---
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === settings.pttKey && !e.repeat) {
                handlePttDown()
            }
        }
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === settings.pttKey) {
                handlePttUp()
                window.electronAPI?.pttRelease?.() // sync main process state
            }
        }

        // --- Main process IPC events (used when in background) ---
        window.electronAPI?.onPttKeyDown?.(handlePttDown)
        window.electronAPI?.onPttKeyUp?.(handlePttUp)

        // --- Focus/blur switching ---
        const onFocus = () => {
            // Focused: renderer handles PTT directly, no globalShortcut needed
            window.electronAPI?.unregisterPttKey?.()
            window.addEventListener('keydown', handleKeyDown)
            window.addEventListener('keyup', handleKeyUp)
        }

        const onBlur = () => {
            // Background: globalShortcut + timer handles PTT
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            // Auto-mute if PTT was active when losing focus
            if (pttActiveRef.current) {
                handlePttUp()
            }
            window.electronAPI?.registerPttKey?.(accelerator)
        }

        // Initial setup based on current focus
        if (document.hasFocus()) {
            // Focused: renderer keydown/keyup
            window.addEventListener('keydown', handleKeyDown)
            window.addEventListener('keyup', handleKeyUp)
        } else {
            // Background: globalShortcut + timer
            window.electronAPI?.registerPttKey?.(accelerator)
        }

        window.addEventListener('focus', onFocus)
        window.addEventListener('blur', onBlur)

        return () => {
            window.electronAPI?.offPttEvents?.()
            window.electronAPI?.unregisterPttKey?.()
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('focus', onFocus)
            window.removeEventListener('blur', onBlur)
        }
    }, [settings.inputMode, settings.pttKey]) // refs avoid re-registration

    // Wrapper: toggleMute + beep + notification
    const handleMuteToggle = useCallback(() => {
        const willMute = !isMutedRef.current
        toggleMute()
        playMuteBeep(willMute)
        window.electronAPI?.showNotification?.('GamerScream', willMute ? `🔇 ${settings.username} muted` : `🎤 ${settings.username} unmuted`)
    }, [toggleMute, playMuteBeep])

    // Mute Toggle Key: Global toggle mute for voice mode
    // Reuses PTT IPC infrastructure (registerPttKey/onPttKeyDown) — no main process changes needed.
    // Only active when inputMode === 'voice' AND muteToggleEnabled === true.
    const toggleMuteRef = useRef(handleMuteToggle)
    toggleMuteRef.current = handleMuteToggle

    useEffect(() => {
        if (settings.inputMode !== 'voice' || !settings.muteToggleEnabled) {
            return
        }

        const accelerator = codeToAccelerator(settings.muteToggleKey)
        let lastToggleTime = 0 // Debounce guard for background key events

        const handleToggle = () => {
            if (!isConnectedRef.current) return
            // Debounce: ignore if toggled within last 300ms (prevents rapid fire from key repeat)
            const now = Date.now()
            if (now - lastToggleTime < 300) return
            lastToggleTime = now
            toggleMuteRef.current()
        }

        // Renderer key events (focused)
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === settings.muteToggleKey && !e.repeat) {
                handleToggle()
            }
        }

        // Main process IPC (background) — only key-down needed for toggle
        window.electronAPI?.onPttKeyDown?.(handleToggle)

        const onFocus = () => {
            window.electronAPI?.unregisterPttKey?.()
            window.addEventListener('keydown', handleKeyDown)
        }

        const onBlur = () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.electronAPI?.registerPttKey?.(accelerator)
        }

        if (document.hasFocus()) {
            window.addEventListener('keydown', handleKeyDown)
        } else {
            window.electronAPI?.registerPttKey?.(accelerator)
        }

        window.addEventListener('focus', onFocus)
        window.addEventListener('blur', onBlur)

        return () => {
            window.electronAPI?.offPttEvents?.()
            window.electronAPI?.unregisterPttKey?.()
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('focus', onFocus)
            window.removeEventListener('blur', onBlur)
        }
    }, [settings.inputMode, settings.muteToggleEnabled, settings.muteToggleKey])

    // PTT: Keybind registration failure
    useEffect(() => {
        window.electronAPI?.onPttRegisterFailed?.((key) => {
            addToast(`Failed to register key: ${key}`, 'leave')
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const handleUsernameSubmit = (username: string) => {
        updateSetting('username', username)
        setHasEnteredName(true)
    }

    const handleConnect = useCallback(async (customRoomName?: string, pin?: string) => {
        setConnectError(null)
        try {
            await connect(settings.username, settings.channel, selectedMic, micLevel, customRoomName, pin, settings.noiseSuppression, settings.joinSoundId, settings.inputMode)
        } catch (err) {
            setConnectError(err instanceof Error ? err.message : 'Connection failed')
        }
    }, [connect, settings.username, settings.channel, selectedMic, micLevel, settings.noiseSuppression, settings.joinSoundId, settings.inputMode])

    const handleMicSelect = (deviceId: string) => {
        setSelectedMic(deviceId)
        updateSetting('microphoneId', deviceId)
    }

    const handleSpeakerSelect = (deviceId: string) => {
        setSelectedSpeaker(deviceId)
        updateSetting('speakerId', deviceId)
        setSpeakerDevice(deviceId) // Route LiveKit audio to selected device
        setSoundOutputDevice(deviceId) // Route notification sounds
        setJoinSoundSpeaker(deviceId) // Route join sounds
    }

    const handleMicLevelChange = (level: number) => {
        setMicLevel(level)
        updateSetting('micLevel', level)
        setMicGain(level)
    }

    const handleNoiseSuppressionChange = (level: number) => {
        updateSetting('noiseSuppression', level)
        setNoiseSuppressionLevel(level)
        // [AUDIT-6] Warn user if pipeline might need reconnect
        if (isConnected && !wetGainActive(level)) {
            addToast('Full effect requires reconnect', 'leave')
        }
    }

    // Check if wet/dry gain nodes are available for real-time adjustment
    const wetGainActive = (level: number) => {
        // If rnnoiseActive is true, slider changes apply in real-time
        // If rnnoiseActive is false or null, changes only take effect on reconnect
        return rnnoiseActive === true && level > 0
    }

    // [AUDIT-5] Notify user when RNNoise initialization fails
    useEffect(() => {
        if (rnnoiseActive === false) {
            addToast('Noise suppression unavailable — using basic filter', 'leave')
        }
    }, [rnnoiseActive]) // eslint-disable-line react-hooks/exhaustive-deps

    // Show loading spinner while checking access token
    if (checkingAccess) {
        return (
            <div className="loading-screen">
                <img src={logoSvg} alt="GamerScream" className="loading-logo" />
                <div className="loading-spinner" />
            </div>
        )
    }

    if (!hasEnteredName || !accessVerified) {
        return (
            <UsernameEntry
                onSubmit={handleUsernameSubmit}
                savedUsername={settings.username}
                needsPin={!accessVerified}
                onPinSubmit={handlePinSubmit}
            />
        )
    }


    return (
        <div className="app">
            {/* Fixed header bar — never scrolls, contains drag region */}
            <div className="app-header-bar">

                {/* Auto-update banner */}
                {updateVersion && (
                    <button
                        className="update-banner"
                        onClick={() => {
                            if (updateReady) {
                                window.electronAPI?.installUpdate()
                            }
                        }}
                    >
                        <Download size={14} />
                        {updateReady
                            ? `v${updateVersion} ready — tap to ${navigator.platform?.includes('Mac') ? 'download' : 'restart'}`
                            : `Downloading v${updateVersion}…`
                        }
                    </button>
                )}

                {/* Drag handle: only this area is draggable for window movement */}
                <div className="drag-handle">
                    <div className="app-header">
                        <img src={logoSvg} alt="GamerScream" className="app-logo" />
                    </div>
                </div>

                <div className="segmented-control">
                    <button
                        className={`segmented-btn ${activeTab === 'channels' ? 'segmented-btn-active' : ''}`}
                        onClick={() => setActiveTab('channels')}
                    >
                        Channels
                    </button>
                    <button
                        className={`segmented-btn ${activeTab === 'settings' ? 'segmented-btn-active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        Settings
                    </button>
                </div>
            </div>

            {/* Scrollable content area */}
            <div className="app-content">
                <ToastContainer toasts={toasts} />

            {activeTab === 'channels' && (
                <>
                    <SessionControls
                        isConnected={isConnected}
                        isConnecting={isConnecting}
                        isReconnecting={isReconnecting}
                        isMuted={isMuted}
                        isVadGateOpen={isVadGateOpen}
                        allMuted={allMuted}
                        channel={settings.channel}

                        players={players}
                        channels={channels}
                        roomName={roomName}
                        username={settings.username}
                        onConnect={handleConnect}
                        onDisconnect={disconnect}
                        onToggleMute={() => {
                            // In PTT/VAD mode, manual mute toggle is disabled
                            if (settings.inputMode !== 'voice') return
                            handleMuteToggle()
                        }}
                        inputMode={settings.inputMode}
                        muteToggleKey={settings.inputMode === 'voice' && settings.muteToggleEnabled ? settings.muteToggleKey : undefined}
                        onToggleMuteAll={toggleMuteAll}
                        onChannelChange={(ch) => updateSetting('channel', ch)}

                        onPlayerVolumeChange={setPlayerVolume}
                        onCreateChannel={createChannel}
                        onVerifyPin={verifyPin}
                        onClearError={() => setConnectError(null)}
                    />

                    {connectError && (
                        <div className="error-banner">⚠️ {connectError}</div>
                    )}
                </>
            )}

            {activeTab === 'settings' && (
                <div className="settings-tab">
                    <MicrophoneSelector
                        microphones={microphones}
                        selectedMic={selectedMic}
                        onSelect={handleMicSelect}
                        micLevel={micLevel}
                        onMicLevelChange={handleMicLevelChange}
                    />

                    <SpeakerSelector
                        speakers={speakers}
                        selectedSpeaker={selectedSpeaker}
                        onSelect={handleSpeakerSelect}
                    />

                    <div className="card">
                        <div className="card-title"><ShieldCheck size={14} /> Noise Suppression</div>
                        <div className="settings-row" style={{ flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step={5}
                                    value={settings.noiseSuppression}
                                    onChange={(e) => handleNoiseSuppressionChange(Number(e.target.value))}
                                    style={{
                                        flex: 1,
                                        background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${settings.noiseSuppression}%, var(--bg-primary) ${settings.noiseSuppression}%, var(--bg-primary) 100%)`
                                    }}
                                />
                                <span className="settings-value" style={{ minWidth: 40, textAlign: 'right' }}>{settings.noiseSuppression}%</span>
                            </div>
                            <span className="settings-hint">
                                {settings.noiseSuppression === 0 ? 'Off — no filtering' :
                                    settings.noiseSuppression < 50 ? 'Low — light background noise reduction' :
                                        settings.noiseSuppression < 80 ? 'Medium — balanced noise reduction' :
                                            'High — aggressive noise cancellation'}
                            </span>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-title"><Mic size={14} /> Input Mode</div>
                        <div className="settings-row">
                            <span className="settings-label">Mode</span>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                    className={`ptt-mode-btn ${settings.inputMode === 'voice' ? 'active' : ''}`}
                                    onClick={() => updateSetting('inputMode', 'voice')}
                                >
                                    Voice
                                </button>
                                <button
                                    className={`ptt-mode-btn ${settings.inputMode === 'vad' ? 'active' : ''}`}
                                    onClick={() => updateSetting('inputMode', 'vad')}
                                >
                                    Activity
                                </button>
                                <button
                                    className={`ptt-mode-btn ${settings.inputMode === 'ptt' ? 'active' : ''}`}
                                    onClick={() => updateSetting('inputMode', 'ptt')}
                                >
                                    Push-to-Talk
                                </button>
                            </div>
                        </div>
                        {settings.inputMode === 'voice' && (
                            <>
                                <div className="settings-row">
                                    <span className="settings-label">Mute Toggle Key</span>
                                    <label className="toggle">
                                        <input
                                            type="checkbox"
                                            checked={settings.muteToggleEnabled}
                                            onChange={(e) => updateSetting('muteToggleEnabled', e.target.checked)}
                                        />
                                        <span className="toggle-track" />
                                    </label>
                                </div>
                                {settings.muteToggleEnabled && (
                                    <div className="settings-row">
                                        <span className="settings-label">Keybind</span>
                                        <button
                                            className={`ptt-keybind-btn ${recordingMuteKeybind ? 'recording' : ''}`}
                                            onClick={() => setRecordingMuteKeybind(true)}
                                            onKeyDown={(e) => {
                                                if (recordingMuteKeybind) {
                                                    e.preventDefault()
                                                    e.stopPropagation()
                                                    updateSetting('muteToggleKey', e.code)
                                                    setRecordingMuteKeybind(false)
                                                }
                                            }}
                                            onBlur={() => setRecordingMuteKeybind(false)}
                                        >
                                            {recordingMuteKeybind ? 'Press any key...' : formatKeyName(settings.muteToggleKey)}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                        {settings.inputMode === 'ptt' && (
                            <div className="settings-row">
                                <span className="settings-label">Keybind</span>
                                <button
                                    className={`ptt-keybind-btn ${recordingKeybind ? 'recording' : ''}`}
                                    onClick={() => setRecordingKeybind(true)}
                                    onKeyDown={(e) => {
                                        if (recordingKeybind) {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            updateSetting('pttKey', e.code)
                                            setRecordingKeybind(false)
                                        }
                                    }}
                                    onBlur={() => setRecordingKeybind(false)}
                                >
                                    {recordingKeybind ? 'Press any key...' : formatKeyName(settings.pttKey)}
                                </button>
                            </div>
                        )}
                        {settings.inputMode === 'vad' && (
                            <div className="settings-row" style={{ flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                                    <input
                                        type="range"
                                        min="1"
                                        max="50"
                                        step={1}
                                        value={settings.vadThreshold}
                                        onChange={(e) => updateSetting('vadThreshold', Number(e.target.value))}
                                        style={{
                                            flex: 1,
                                            background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${settings.vadThreshold * 2}%, var(--bg-primary) ${settings.vadThreshold * 2}%, var(--bg-primary) 100%)`
                                        }}
                                    />
                                    <span className="settings-value" style={{ minWidth: 40, textAlign: 'right' }}>{settings.vadThreshold}%</span>
                                </div>
                            </div>
                        )}
                        <span className="settings-hint">
                            {settings.inputMode === 'voice'
                                ? (settings.muteToggleEnabled
                                    ? `Press ${formatKeyName(settings.muteToggleKey)} to toggle mute — works in background`
                                    : 'Always transmitting when connected')
                                : settings.inputMode === 'vad'
                                    ? 'Auto-mutes when you stop talking — noise gate'
                                    : `Hold ${formatKeyName(settings.pttKey)} to talk — works in background`}
                        </span>
                    </div>

                    <div className="card">
                        <div className="card-title"><Bell size={14} /> Join Sound</div>
                        <div className="join-sound-grid">
                            {JOIN_SOUNDS.map((sound) => (
                                <button
                                    key={sound.id}
                                    className={`join-sound-btn ${settings.joinSoundId === sound.id ? 'active' : ''}`}
                                    onClick={() => {
                                        updateSetting('joinSoundId', sound.id)
                                        playJoinSoundById(sound.id)
                                    }}
                                >
                                    {sound.emoji} {sound.name}
                                </button>
                            ))}
                        </div>
                        <span className="settings-hint">
                            "{JOIN_SOUNDS.find(s => s.id === settings.joinSoundId)?.name}" plays for others when you join
                        </span>
                    </div>

                    <div className="card">
                        <div className="card-title"><User size={14} /> Account</div>
                        <div className="settings-row">
                            <span className="settings-label">Signed in as</span>
                            <span className="settings-value">{settings.username}</span>
                        </div>
                        <button className="settings-signout" onClick={() => setHasEnteredName(false)}>
                            Change Name
                        </button>
                    </div>

                    <div className="settings-version">
                        <span className="version-badge" onDoubleClick={() => setShowAdmin(true)} style={{ cursor: 'default' }}>v{APP_VERSION}</span>
                    </div>

                    {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
                </div>
            )}
            </div>
        </div>
    )
}

// Global type for access token
declare global {
    interface Window {
        __gamerScreamAccessToken?: string
    }
}
