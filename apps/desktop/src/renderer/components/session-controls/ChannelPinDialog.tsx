import { useRef, useState } from 'react'
import { Lock, X } from 'lucide-react'
import type { ChannelInfo } from '../../types'
import { Dialog } from '../Dialog'
import type { SelectedCustomRoom, SessionControlsProps } from './types'

interface ChannelPinDialogProps {
    channel: ChannelInfo
    onVerifyPin: SessionControlsProps['onVerifyPin']
    onSelected: (selection: SelectedCustomRoom) => void
    onClose: () => void
}

export function ChannelPinDialog({
    channel,
    onVerifyPin,
    onSelected,
    onClose
}: ChannelPinDialogProps) {
    const [pin, setPin] = useState('')
    const [error, setError] = useState('')
    const pinRef = useRef<HTMLInputElement>(null)

    const handleSubmit = async () => {
        if (!/^\d{4}$/.test(pin)) {
            setError('Enter the 4-digit PIN')
            return
        }

        const roomName = channel.roomName || channel.name
        const roomCapability = await onVerifyPin(roomName, pin)
        if (roomCapability) {
            onClose()
            onSelected({ roomName, roomCapability })
        } else {
            setError('Wrong PIN')
        }
    }

    return (
        <Dialog
            open
            title="Enter channel PIN"
            onClose={onClose}
            initialFocusRef={pinRef}
        >
            <form onSubmit={(event) => { event.preventDefault(); handleSubmit() }}>
                <div className="dialog-header">
                    <h3><Lock size={14} aria-hidden="true" /> Enter PIN</h3>
                    <button
                        type="button"
                        className="dialog-close"
                        aria-label="Close PIN dialog"
                        onClick={onClose}
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>
                <div className="dialog-body">
                    <p className="dialog-text">
                        <strong>{channel.name}</strong> requires a PIN to join.
                    </p>
                    <input
                        ref={pinRef}
                        type="text"
                        name="channelPin"
                        aria-label="Channel PIN"
                        className="dialog-input pin-input-center"
                        placeholder="1234…"
                        value={pin}
                        onChange={(event) => {
                            setPin(event.target.value.slice(0, 4))
                            setError('')
                        }}
                        maxLength={4}
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        autoComplete="one-time-code"
                    />
                    {error && <div className="dialog-error" role="alert">{error}</div>}
                </div>
                <div className="dialog-footer">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">Select channel</button>
                </div>
            </form>
        </Dialog>
    )
}
