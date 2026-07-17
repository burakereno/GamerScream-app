import { useState } from 'react'
import { Lock } from 'lucide-react'
import logoSvg from '../assets/logo.svg'

interface Props {
    onSubmit: (username: string) => void
    savedUsername: string
    needsPin: boolean
    onPinSubmit: (pin: string) => Promise<boolean | string>
}

export function UsernameEntry({ onSubmit, savedUsername, needsPin, onPinSubmit }: Props) {
    const [name, setName] = useState(savedUsername)
    const [pin, setPin] = useState('')
    const [pinError, setPinError] = useState('')
    const [nameError, setNameError] = useState('')
    const [isVerifying, setIsVerifying] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) {
            setNameError('Enter a display name')
            return
        }

        if (needsPin) {
            if (!pin.trim()) {
                setPinError('PIN required')
                return
            }
            if (!/^\d{4,8}$/.test(pin.trim())) {
                setPinError('PIN must contain 4–8 digits')
                return
            }
            setIsVerifying(true)
            setPinError('')
            const result = await onPinSubmit(pin.trim())
            setIsVerifying(false)
            if (result !== true) {
                setPinError(typeof result === 'string' ? result : 'Wrong PIN')
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
                    <label className="sr-only" htmlFor="display-name">Display name</label>
                    <input
                        id="display-name"
                        name="displayName"
                        className="username-input"
                        type="text"
                        value={name}
                        onChange={(e) => { setName(e.target.value); setNameError('') }}
                        placeholder="Your name…"
                        autoFocus
                        autoComplete="username"
                        maxLength={20}
                    />
                    {nameError && <span className="pin-gate-error" role="alert">{nameError}</span>}

                    {needsPin && (
                        <div className="pin-gate">
                            <div className="pin-gate-row">
                                <label className="sr-only" htmlFor="app-pin">App PIN</label>
                                <input
                                    id="app-pin"
                                    name="appPin"
                                    className="username-input pin-gate-input"
                                    type="password"
                                    value={pin}
                                    onChange={(e) => { setPin(e.target.value.slice(0, 8)); setPinError('') }}
                                    placeholder="App PIN…"
                                    maxLength={8}
                                    inputMode="numeric"
                                    pattern="[0-9]{4,8}"
                                    autoComplete="one-time-code"
                                />
                            </div>
                            {pinError && <span className="pin-gate-error" role="alert">{pinError}</span>}
                        </div>
                    )}

                    <button className="btn-enter" type="submit" disabled={isVerifying}>
                        {isVerifying ? 'Verifying…' : 'Enter Voice Chat'}
                    </button>
                </form>
            </div>
        </div>
    )
}
