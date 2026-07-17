import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Dialog } from '../Dialog'
import type { SelectedCustomRoom, SessionControlsProps } from './types'

interface CreateChannelDialogProps {
    username: string
    onCreateChannel: SessionControlsProps['onCreateChannel']
    onCreated: (selection: SelectedCustomRoom) => void
    onClose: () => void
}

function getErrorMessage(reason: unknown): string {
    if (typeof reason === 'object' && reason !== null && 'message' in reason) {
        const message = (reason as { message?: unknown }).message
        if (typeof message === 'string' && message) return message
    }
    return 'Failed to create'
}

export function CreateChannelDialog({
    username,
    onCreateChannel,
    onCreated,
    onClose
}: CreateChannelDialogProps) {
    const [channelName, setChannelName] = useState('')
    const [channelPin, setChannelPin] = useState('')
    const [error, setError] = useState('')
    const [isCreating, setIsCreating] = useState(false)
    const nameRef = useRef<HTMLInputElement>(null)

    const handleSubmit = async () => {
        if (!channelName.trim()) {
            setError('Channel name required')
            return
        }
        if (channelPin && !/^\d{4}$/.test(channelPin)) {
            setError('PIN must contain exactly 4 digits')
            return
        }

        setIsCreating(true)
        setError('')
        try {
            const result = await onCreateChannel(channelName.trim(), channelPin, username)
            onClose()
            onCreated({
                roomName: result.roomName,
                roomCapability: result.roomCapability
            })
        } catch (reason: unknown) {
            setError(getErrorMessage(reason))
        } finally {
            setIsCreating(false)
        }
    }

    return (
        <Dialog
            open
            title="Create channel"
            onClose={onClose}
            initialFocusRef={nameRef}
        >
            <form onSubmit={(event) => { event.preventDefault(); handleSubmit() }}>
                <div className="dialog-header">
                    <h3>Create Channel</h3>
                    <button
                        type="button"
                        className="dialog-close"
                        aria-label="Close create channel dialog"
                        onClick={onClose}
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>
                <div className="dialog-body">
                    <label className="dialog-label">
                        Channel Name
                        <input
                            ref={nameRef}
                            type="text"
                            name="channelName"
                            className="dialog-input"
                            placeholder="Team Alpha…"
                            value={channelName}
                            onChange={(event) => setChannelName(event.target.value.slice(0, 20))}
                            maxLength={20}
                            autoComplete="off"
                        />
                    </label>
                    <label className="dialog-label">
                        PIN (optional)
                        <input
                            type="text"
                            name="channelPin"
                            className="dialog-input"
                            placeholder="1234…"
                            value={channelPin}
                            onChange={(event) => {
                                setChannelPin(event.target.value.slice(0, 4))
                                setError('')
                            }}
                            maxLength={4}
                            inputMode="numeric"
                            pattern="[0-9]{4}"
                            autoComplete="off"
                        />
                        <span className="dialog-hint">
                            Use exactly 4 digits, or leave empty for an open channel.
                        </span>
                    </label>
                    {error && <div className="dialog-error" role="alert">{error}</div>}
                </div>
                <div className="dialog-footer">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={isCreating}>
                        {isCreating ? 'Creating…' : 'Create & Join'}
                    </button>
                </div>
            </form>
        </Dialog>
    )
}
