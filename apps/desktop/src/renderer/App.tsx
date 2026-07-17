import { useCallback, useEffect, useMemo, useState } from 'react'
import { AccessGate } from './components/app-shell/AccessGate'
import { AppHeader } from './components/app-shell/AppHeader'
import { SessionView } from './components/app-shell/SessionView'
import { SettingsView } from './components/app-shell/SettingsView'
import type { AppTab } from './components/app-shell/types'
import { ToastContainer, useToast } from './components/Toast'
import { useAccessControl } from './hooks/app/useAccessControl'
import { useConnectionFeedback } from './hooks/app/useConnectionFeedback'
import { useDesktopUpdate } from './hooks/app/useDesktopUpdate'
import { useDeviceSettingsSync } from './hooks/app/useDeviceSettingsSync'
import {
    useLocalSpeakingIndicator,
    withLocalSpeakingState
} from './hooks/app/useLocalSpeakingIndicator'
import { useParticipantNotifications } from './hooks/app/useParticipantNotifications'
import { useVoiceInputLifecycle } from './hooks/app/useVoiceInputLifecycle'
import { useAudioDevices } from './hooks/useAudioDevices'
import { useMicrophoneLevelMonitor } from './hooks/useMicrophoneLevelMonitor'
import { useLiveKit } from './hooks/useLiveKit'
import { useSettings } from './hooks/useSettings'

export default function App() {
    const { settings, updateSetting } = useSettings()
    const { accessVerified, checkingAccess, submitPin, revokeAccess } = useAccessControl()
    const { updateStatus, appVersion } = useDesktopUpdate()
    const { toasts, addToast } = useToast()
    const {
        connectError,
        clearConnectError,
        reportConnectError,
        reportReconnectFailure
    } = useConnectionFeedback()

    const [hasEnteredName, setHasEnteredName] = useState(!!settings.username)
    const [activeTab, setActiveTab] = useState<AppTab>('channels')
    const [showAdmin, setShowAdmin] = useState(false)
    const [recordingKeybind, setRecordingKeybind] = useState(false)
    const [recordingMuteKeybind, setRecordingMuteKeybind] = useState(false)

    useEffect(() => {
        if (settings.username) setHasEnteredName(true)
    }, [settings.username])

    const {
        microphones,
        speakers,
        selectedMic,
        setSelectedMic,
        selectedSpeaker,
        setSelectedSpeaker,
        micLevel,
        setMicLevel
    } = useAudioDevices(accessVerified)

    const { callbacks, playMuteBeep } = useParticipantNotifications({
        addToast,
        onAuthExpired: revokeAccess,
        onReconnectFailed: reportReconnectFailure
    })

    const {
        isConnected,
        isConnecting,
        isReconnecting,
        isMuted,
        isVadGateOpen,
        allMuted,
        players,
        roomName,
        channels,
        rnnoiseActive,
        connect,
        disconnect,
        cancelReconnect,
        toggleMute,
        setMuted,
        toggleMuteAll,
        setPlayerVolume,
        createChannel,
        verifyPin,
        setMicGain,
        setNoiseSuppressionLevel,
        getRawMicLevel,
        setVadGate,
        setVadActive,
        setSpeakerDevice,
        updateInputModeMetadata,
        updateReconnectNoiseSuppression
    } = useLiveKit(callbacks, accessVerified)

    const {
        handleMicSelect,
        handleSpeakerSelect,
        handleMicLevelChange,
        handleNoiseSuppressionChange
    } = useDeviceSettingsSync({
        settings,
        microphones,
        speakers,
        isConnected,
        rnnoiseActive,
        setSelectedMic,
        setSelectedSpeaker,
        setMicLevel,
        setSpeakerDevice,
        setMicGain,
        setNoiseSuppressionLevel,
        updateReconnectNoiseSuppression,
        updateSetting,
        addToast
    })

    const { handleMuteToggle } = useVoiceInputLifecycle({
        isConnected,
        isMuted,
        inputMode: settings.inputMode,
        pttKey: settings.pttKey,
        muteToggleEnabled: settings.muteToggleEnabled,
        muteToggleKey: settings.muteToggleKey,
        vadThreshold: settings.vadThreshold,
        username: settings.username,
        toggleMute,
        setMuted,
        setVadGate,
        setVadActive,
        getRawMicLevel,
        updateInputModeMetadata,
        playMuteBeep,
        addToast
    })

    const { getLevel: getMicActivityLevel } = useMicrophoneLevelMonitor(
        selectedMic,
        isConnected && activeTab === 'channels',
        false
    )
    const localIsSpeaking = useLocalSpeakingIndicator({
        isConnected,
        isMuted,
        micLevel,
        inputMode: settings.inputMode,
        isVadGateOpen,
        getMicActivityLevel
    })
    const visiblePlayers = useMemo(
        () => withLocalSpeakingState(players, localIsSpeaking),
        [players, localIsSpeaking]
    )

    const handleUsernameSubmit = (username: string) => {
        updateSetting('username', username)
        setHasEnteredName(true)
    }

    const handleConnect = useCallback(async (
        customRoomName?: string,
        roomCapability?: string
    ) => {
        clearConnectError()
        try {
            await connect(
                settings.username,
                settings.channel,
                selectedMic,
                micLevel,
                customRoomName,
                roomCapability,
                settings.noiseSuppression,
                settings.joinSoundId,
                settings.inputMode
            )
        } catch (error) {
            reportConnectError(error instanceof Error ? error.message : 'Connection failed')
        }
    }, [
        clearConnectError,
        connect,
        settings.username,
        settings.channel,
        selectedMic,
        micLevel,
        settings.noiseSuppression,
        settings.joinSoundId,
        settings.inputMode,
        reportConnectError
    ])

    return (
        <AccessGate
            checkingAccess={checkingAccess}
            accessVerified={accessVerified}
            hasEnteredName={hasEnteredName}
            savedUsername={settings.username}
            onUsernameSubmit={handleUsernameSubmit}
            onPinSubmit={submitPin}
        >
            <div className="app">
                <AppHeader
                    updateStatus={updateStatus}
                    installUpdate={() => window.electronAPI.installUpdate()}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                />

                <div className="app-content">
                    <ToastContainer toasts={toasts} />

                    {activeTab === 'channels' && (
                        <SessionView
                            isConnected={isConnected}
                            isConnecting={isConnecting}
                            isReconnecting={isReconnecting}
                            isMuted={isMuted}
                            isVadGateOpen={isVadGateOpen}
                            allMuted={allMuted}
                            channel={settings.channel}
                            players={visiblePlayers}
                            channels={channels}
                            roomName={roomName}
                            username={settings.username}
                            onConnect={handleConnect}
                            onDisconnect={disconnect}
                            onCancelReconnect={cancelReconnect}
                            onToggleMute={() => {
                                if (settings.inputMode !== 'voice') return
                                handleMuteToggle()
                            }}
                            inputMode={settings.inputMode}
                            muteToggleKey={
                                settings.inputMode === 'voice' && settings.muteToggleEnabled
                                    ? settings.muteToggleKey
                                    : undefined
                            }
                            onToggleMuteAll={toggleMuteAll}
                            onChannelChange={(channel) => updateSetting('channel', channel)}
                            onPlayerVolumeChange={setPlayerVolume}
                            onCreateChannel={createChannel}
                            onVerifyPin={verifyPin}
                            onClearError={clearConnectError}
                            connectError={connectError}
                        />
                    )}

                    {activeTab === 'settings' && (
                        <SettingsView
                            settings={settings}
                            updateSetting={updateSetting}
                            microphones={microphones}
                            selectedMic={selectedMic}
                            micLevel={micLevel}
                            onMicSelect={handleMicSelect}
                            onMicLevelChange={handleMicLevelChange}
                            speakers={speakers}
                            selectedSpeaker={selectedSpeaker}
                            onSpeakerSelect={handleSpeakerSelect}
                            onNoiseSuppressionChange={handleNoiseSuppressionChange}
                            onChangeName={() => setHasEnteredName(false)}
                            appVersion={appVersion}
                            showAdmin={showAdmin}
                            onOpenAdmin={() => setShowAdmin(true)}
                            onCloseAdmin={() => setShowAdmin(false)}
                            recordingKeybind={recordingKeybind}
                            setRecordingKeybind={setRecordingKeybind}
                            recordingMuteKeybind={recordingMuteKeybind}
                            setRecordingMuteKeybind={setRecordingMuteKeybind}
                        />
                    )}
                </div>
            </div>
        </AccessGate>
    )
}
