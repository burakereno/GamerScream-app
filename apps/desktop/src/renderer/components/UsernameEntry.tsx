import { useState } from 'react'
import { Lock } from 'lucide-react'
import logoSvg from '../assets/logo.svg'

interface Props {
    onSubmit: (username: string) => void
    savedUsername: string
    needsPin: boolean
    onPinSubmit: (pin: string) => Promise<boolean>
}

export function UsernameEntry({ onSubmit, savedUsername, needsPin, onPinSubmit }: Props) {
    const [name, setName] = useState(savedUsername)
    const [pin, setPin] = useState('')
    const [pinError, setPinError] = useState('')
    const [isVerifying, setIsVerifying] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return

        if (needsPin) {
            if (!pin.trim()) {
                setPinError('PIN required')
                return
            }
            setIsVerifying(true)
            setPinError('')
            const valid = await onPinSubmit(pin.trim())
            setIsVerifying(false)
            if (!valid) {
                setPinError('Wrong PIN')
                return
            }
        }

        onSubmit(name.trim())
    }

    return (
        <div className="username-screen">
            <div className="drag-region" />
            <div className="username-container">
                <img src={logoSvg} alt="GamerScream" className="username-logo" />
                <p className="username-subtitle">Enter your name to get started</p>

                <form className="username-form" onSubmit={handleSubmit}>
                    <input
                        className="username-input"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name..."
                        autoFocus
                        maxLength={20}
                    />

                    {needsPin && (
                        <div className="pin-gate">
                            <div className="pin-gate-row">
                                <input
                                    className="username-input pin-gate-input"
                                    type="password"
                                    value={pin}
                                    onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError('') }}
                                    placeholder="App PIN"
                                    maxLength={4}
                                />
                            </div>
                            {pinError && <span className="pin-gate-error">{pinError}</span>}
                        </div>
                    )}

                    <button className="btn-enter" type="submit" disabled={!name.trim() || isVerifying}>
                        {isVerifying ? 'Verifying...' : 'Enter Voice Chat'}
                    </button>
                </form>
            </div>
        </div>
    )
}
