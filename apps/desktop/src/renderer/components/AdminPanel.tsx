import { useState } from 'react'
import { Shield, Key, UserX, Lock, ArrowLeft, Loader2, Check, AlertTriangle } from 'lucide-react'

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3002'

interface AdminPanelProps {
    onClose: () => void
}

export function AdminPanel({ onClose }: AdminPanelProps) {
    const [adminSecret, setAdminSecret] = useState('')
    const [isVerified, setIsVerified] = useState(false)
    const [verifying, setVerifying] = useState(false)
    const [error, setError] = useState('')

    const [newPin, setNewPin] = useState('')
    const [actionLoading, setActionLoading] = useState('')
    const [actionResult, setActionResult] = useState('')
    const [actionIsError, setActionIsError] = useState(false)
    const [confirmAction, setConfirmAction] = useState<{ endpoint: string; label: string; body?: Record<string, unknown> } | null>(null)

    const verify = async () => {
        setVerifying(true)
        setError('')
        try {
            const res = await fetch(`${SERVER_URL}/api/admin/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret: adminSecret })
            })
            if (res.ok) {
                setIsVerified(true)
            } else {
                setError('Wrong secret')
            }
        } catch {
            setError('Connection error')
        }
        setVerifying(false)
    }

    const adminAction = async (endpoint: string, body: Record<string, unknown> = {}) => {
        setConfirmAction(null)
        setActionLoading(endpoint)
        setActionResult('')
        setActionIsError(false)
        try {
            const res = await fetch(`${SERVER_URL}/api/admin/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret: adminSecret, ...body })
            })
            const data = await res.json()
            if (res.ok) {
                setActionResult(data.message || `Kicked ${data.kicked} users`)
                if (endpoint === 'change-pin') setNewPin('')
            } else {
                setActionIsError(true)
                setActionResult(data.error || 'Unknown error')
            }
        } catch {
            setActionIsError(true)
            setActionResult('Connection error')
        }
        setActionLoading('')
    }

    const requestConfirm = (endpoint: string, label: string, body?: Record<string, unknown>) => {
        setConfirmAction({ endpoint, label, body })
    }

    return (
        <div className="admin-page">
            {/* Header */}
            <div className="admin-page-header">
                <button className="admin-back-btn" onClick={onClose}>
                    <ArrowLeft size={18} />
                </button>
                <Shield size={16} color="#f97316" />
                <span>Admin</span>
            </div>

            {!isVerified ? (
                <div className="admin-page-content">
                    <div className="admin-login-card">
                        <Lock size={24} color="var(--text-muted)" />
                        <p className="admin-login-text">Enter admin secret to continue</p>
                        <input
                            type="password"
                            value={adminSecret}
                            onChange={e => { setAdminSecret(e.target.value); setError('') }}
                            onKeyDown={e => e.key === 'Enter' && verify()}
                            placeholder="Admin secret"
                            className="admin-input"
                            autoFocus
                        />
                        {error && <p className="admin-error">{error}</p>}
                        <button className="admin-action-btn accent" onClick={verify} disabled={verifying || !adminSecret}>
                            {verifying ? <Loader2 size={14} className="spin" /> : <Key size={14} />}
                            Verify
                        </button>
                    </div>
                </div>
            ) : (
                <div className="admin-page-content">
                    {actionResult && (
                        <div className={actionIsError ? 'admin-result error' : 'admin-result'}>
                            {actionIsError ? <AlertTriangle size={12} /> : <Check size={12} />} {actionResult}
                        </div>
                    )}

                    {/* Change PIN */}
                    <div className="admin-card">
                        <div className="admin-card-header">
                            <Key size={14} color="var(--accent)" />
                            <span>Change App PIN</span>
                        </div>
                        <p className="admin-card-desc">Changes PIN and invalidates all existing tokens</p>
                        <input
                            type="text"
                            value={newPin}
                            onChange={e => setNewPin(e.target.value)}
                            placeholder="New PIN (min 4 characters)"
                            className="admin-input"
                        />
                        <button
                            className="admin-action-btn accent"
                            onClick={() => requestConfirm('change-pin', 'Change PIN? All users will be logged out.', { newPin })}
                            disabled={!!actionLoading || newPin.length < 4}
                        >
                            {actionLoading === 'change-pin' ? <Loader2 size={14} className="spin" /> : <Key size={14} />}
                            Change PIN
                        </button>
                    </div>

                    {/* Kick All */}
                    <div className="admin-card">
                        <div className="admin-card-header">
                            <UserX size={14} color="#ef4444" />
                            <span>Kick All Users</span>
                        </div>
                        <p className="admin-card-desc">Remove all participants from all rooms immediately</p>
                        <button
                            className="admin-action-btn danger"
                            onClick={() => requestConfirm('kick-all', 'Kick all users from all rooms?')}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === 'kick-all' ? <Loader2 size={14} className="spin" /> : <UserX size={14} />}
                            Kick Everyone
                        </button>
                    </div>

                    {/* Invalidate Tokens */}
                    <div className="admin-card">
                        <div className="admin-card-header">
                            <Lock size={14} color="#ef4444" />
                            <span>Invalidate All Tokens</span>
                        </div>
                        <p className="admin-card-desc">Everyone must re-enter the PIN to use the app</p>
                        <button
                            className="admin-action-btn danger"
                            onClick={() => requestConfirm('invalidate-tokens', 'Invalidate all tokens? Everyone must re-enter PIN.')}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === 'invalidate-tokens' ? <Loader2 size={14} className="spin" /> : <Lock size={14} />}
                            Invalidate Tokens
                        </button>
                    </div>
                </div>
            )}

            {/* Confirmation modal */}
            {confirmAction && (
                <div className="confirm-overlay" onClick={() => setConfirmAction(null)}>
                    <div className="confirm-modal" onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={20} color="#f97316" />
                        <p className="confirm-text">{confirmAction.label}</p>
                        <div className="confirm-buttons">
                            <button className="confirm-btn cancel" onClick={() => setConfirmAction(null)}>Cancel</button>
                            <button className="confirm-btn proceed" onClick={() => adminAction(confirmAction.endpoint, confirmAction.body)}>
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
