import type { ReactNode } from 'react'
import { UsernameEntry } from '../UsernameEntry'
import logoSvg from '../../assets/logo.svg'

interface AccessGateProps {
    checkingAccess: boolean
    accessVerified: boolean
    hasEnteredName: boolean
    savedUsername: string
    onUsernameSubmit: (username: string) => void
    onPinSubmit: (pin: string) => Promise<boolean | string>
    children: ReactNode
}

export function AccessGate({
    checkingAccess,
    accessVerified,
    hasEnteredName,
    savedUsername,
    onUsernameSubmit,
    onPinSubmit,
    children
}: AccessGateProps) {
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
                onSubmit={onUsernameSubmit}
                savedUsername={savedUsername}
                needsPin={!accessVerified}
                onPinSubmit={onPinSubmit}
            />
        )
    }

    return children
}
