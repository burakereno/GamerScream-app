import { useState, useCallback, useEffect, useRef } from 'react'
import { MicrophoneSelector } from './components/MicrophoneSelector'
import { SpeakerSelector } from './components/SpeakerSelector'
import { SessionControls } from './components/SessionControls'
import { UsernameEntry } from './components/UsernameEntry'
import { useAudioDevices } from './hooks/useAudioDevices'
import { useLiveKit } from './hooks/useLiveKit'
import { useSettings } from './hooks/useSettings'
import { User } from 'lucide-react'
import logoSvg from './assets/logo.svg'

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3001'
const ACCESS_TOKEN_KEY = 'gamerscream-access-token'

export default function App() {
    const { settings, updateSetting } = useSettings()
    const {
        microphones, speakers, selectedMic, setSelectedMic,
        selectedSpeaker, setSelectedSpeaker, micLevel, setMicLevel
    } = useAudioDevices()
    const {
        isConnected, isConnecting, isMuted, allMuted, players, roomName, channels,
        connect, disconnect, toggleMute, toggleMuteAll, setPlayerVolume,
        createChannel, verifyPin
    } = useLiveKit()

    const [hasEnteredName, setHasEnteredName] = useState(!!settings.username)
    const [connectError, setConnectError] = useState<string | null>(null)
    const autoConnectDone = useRef(false)
    const [activeTab, setActiveTab] = useState<'channels' | 'settings'>('channels')

    // Access token state — checks localStorage on load
    const [accessVerified, setAccessVerified] = useState(false)
    const [checkingAccess, setCheckingAccess] = useState(true)

    // On mount: check if stored access token is still valid
    useEffect(() => {
        const stored = localStorage.getItem(ACCESS_TOKEN_KEY)
        if (!stored) {
            setCheckingAccess(false)
            return
        }
        fetch(`${SERVER_URL}/api/verify-access-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: stored })
        })
            .then(r => r.json())
            .then(data => {
                if (data.valid) {
                    setAccessVerified(true)
                    // Store globally for API calls
                    window.__gamerScreamAccessToken = stored
                } else {
                    localStorage.removeItem(ACCESS_TOKEN_KEY)
                }
            })
            .catch(() => { /* offline — let them try */ })
            .finally(() => setCheckingAccess(false))
    }, [])

    const handlePinSubmit = async (pin: string): Promise<boolean> => {
        try {
            const res = await fetch(`${SERVER_URL}/api/verify-app-pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
            })
            if (!res.ok) return false
            const data = await res.json()
            if (data.accessToken) {
                localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken)
                window.__gamerScreamAccessToken = data.accessToken
                setAccessVerified(true)
                return true
            }
            return false
        } catch {
            return false
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
        }
    }, [settings.speakerId, speakers, setSelectedSpeaker])

    // Auto-connect on launch or after entering name
    useEffect(() => {
        if (hasEnteredName && settings.autoConnect && !isConnected && !isConnecting && !autoConnectDone.current) {
            autoConnectDone.current = true
            connect(settings.username, settings.channel, selectedMic, micLevel).catch((err) => {
                setConnectError(err instanceof Error ? err.message : 'Auto-connect failed')
            })
        }
    }, [hasEnteredName, settings.autoConnect]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleUsernameSubmit = (username: string) => {
        updateSetting('username', username)
        setHasEnteredName(true)
    }

    const handleConnect = useCallback(async (customRoomName?: string, pin?: string) => {
        setConnectError(null)
        try {
            await connect(settings.username, settings.channel, selectedMic, micLevel, customRoomName, pin)
        } catch (err) {
            setConnectError(err instanceof Error ? err.message : 'Connection failed')
        }
    }, [connect, settings.username, settings.channel, selectedMic, micLevel])

    const handleMicSelect = (deviceId: string) => {
        setSelectedMic(deviceId)
        updateSetting('microphoneId', deviceId)
    }

    const handleSpeakerSelect = (deviceId: string) => {
        setSelectedSpeaker(deviceId)
        updateSetting('speakerId', deviceId)
    }

    const handleMicLevelChange = (level: number) => {
        setMicLevel(level)
        updateSetting('micLevel', level)
    }

    // Show loading while checking access token
    if (checkingAccess) {
        return null
    }

    if (!hasEnteredName) {
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
            <div className="app-header">
                <img src={logoSvg} alt="GamerScream" className="app-logo" />
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

            {activeTab === 'channels' && (
                <>
                    <SessionControls
                        isConnected={isConnected}
                        isConnecting={isConnecting}
                        isMuted={isMuted}
                        allMuted={allMuted}
                        channel={settings.channel}
                        autoConnect={settings.autoConnect}
                        players={players}
                        channels={channels}
                        roomName={roomName}
                        username={settings.username}
                        onConnect={handleConnect}
                        onDisconnect={disconnect}
                        onToggleMute={toggleMute}
                        onToggleMuteAll={toggleMuteAll}
                        onChannelChange={(ch) => updateSetting('channel', ch)}
                        onAutoConnectChange={(ac) => updateSetting('autoConnect', ac)}
                        onPlayerVolumeChange={setPlayerVolume}
                        onCreateChannel={createChannel}
                        onVerifyPin={verifyPin}
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
                        <span className="version-badge">v1.0.0</span>
                    </div>
                </div>
            )}
        </div>
    )
}

// Global type for access token
declare global {
    interface Window {
        __gamerScreamAccessToken?: string
    }
}
