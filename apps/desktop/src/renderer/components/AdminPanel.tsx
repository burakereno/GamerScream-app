import { useState } from 'react'
import { Shield, Key, UserX, Lock, ArrowLeft, Loader2, Check, AlertTriangle } from 'lucide-react'
import { Dialog } from './Dialog'

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3002'

interface AdminPanelProps {
    onClose: () => void
}

interface AdminActionResponse {
    success?: boolean
    message?: string
    error?: string
    kicked?: number
    failed?: number
}

type ActionResult = {
    tone: 'success' | 'warning' | 'error'
    message: string
}

function withOperationCounts(message: string, data: AdminActionResponse): string {
    const counts = [
        typeof data.kicked === 'number' ? `Participants removed: ${data.kicked}.` : '',
        typeof data.failed === 'number' ? `LiveKit operations failed: ${data.failed}.` : ''
    ].filter(Boolean).join(' ')

    return counts ? `${message} ${counts}` : message
}

export function AdminPanel({ onClose }: AdminPanelProps) {
    const [adminSecret, setAdminSecret] = useState('')
    const [isVerified, setIsVerified] = useState(false)
    const [verifying, setVerifying] = useState(false)
    const [error, setError] = useState('')

    const [newPin, setNewPin] = useState('')
    const [actionLoading, setActionLoading] = useState('')
    const [actionResult, setActionResult] = useState<ActionResult | null>(null)
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
        setActionResult(null)
        try {
            const res = await fetch(`${SERVER_URL}/api/admin/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret: adminSecret, ...body })
            })
            const data = await res.json() as AdminActionResponse
            if (!res.ok) {
                setActionResult({
                    tone: 'error',
                    message: withOperationCounts(data.error || data.message || 'Unknown error', data)
                })
            } else if (res.status === 207 || data.success === false) {
                setActionResult({
                    tone: 'warning',
                    message: withOperationCounts(data.message || 'Admin action completed only partially. Retry the action.', data)
                })
                if (endpoint === 'change-pin') setNewPin('')
            } else {
                setActionResult({
                    tone: 'success',
                    message: withOperationCounts(data.message || 'Admin action completed.', data)
                })
                if (endpoint === 'change-pin') setNewPin('')
            }
        } catch {
            setActionResult({ tone: 'error', message: 'Connection error' })
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
                <button type="button" className="admin-back-btn" aria-label="Close admin panel" onClick={onClose}>
                    <ArrowLeft size={18} aria-hidden="true" />
                </button>
                <Shield size={16} color="#f97316" />
                <span>Admin</span>
            </div>

            {!isVerified ? (
                <div className="admin-page-content">
                    <div className="admin-login-card">
                        <Lock size={24} color="var(--text-muted)" />
                        <p className="admin-login-text">Enter admin secret to continue</p>
                        <form onSubmit={(event) => { event.preventDefault(); verify() }}>
                            <label className="admin-field-label">
                                Admin secret
                                <input
                                    type="password"
                                    name="adminSecret"
                                    value={adminSecret}
                                    onChange={e => { setAdminSecret(e.target.value); setError('') }}
                                    placeholder="Enter admin secret…"
                                    className="admin-input"
                                    autoComplete="current-password"
                                    autoFocus
                                />
                            </label>
                            {error && <p className="admin-error" role="alert">{error}</p>}
                            <button type="submit" className="admin-action-btn accent" disabled={verifying || !adminSecret}>
                                {verifying ? <Loader2 size={14} className="spin" /> : <Key size={14} />}
                                Verify
                            </button>
                        </form>
                    </div>
                </div>
            ) : (
                <div className="admin-page-content">
                    {actionResult && (
                        <div
                            className={`admin-result ${actionResult.tone}`}
                            role={actionResult.tone === 'success' ? 'status' : 'alert'}
                            aria-atomic="true"
                        >
                            {actionResult.tone === 'success'
                                ? <Check size={12} aria-hidden="true" />
                                : <AlertTriangle size={12} aria-hidden="true" />}
                            <span>{actionResult.message}</span>
                        </div>
                    )}

                    {/* Change PIN */}
                    <div className="admin-card">
                        <div className="admin-card-header">
                            <Key size={14} color="var(--accent)" />
                            <span>Change App PIN</span>
                        </div>
                        <p className="admin-card-desc">Changes PIN and invalidates all existing tokens</p>
                        <label className="admin-field-label">
                            New app PIN
                            <input
                                type="text"
                                name="newAppPin"
                                value={newPin}
                                onChange={e => setNewPin(e.target.value.slice(0, 8))}
                                placeholder="4–8 digits…"
                                className="admin-input"
                                maxLength={8}
                                inputMode="numeric"
                                pattern="[0-9]{4,8}"
                                autoComplete="new-password"
                            />
                        </label>
                        <button
                            className="admin-action-btn accent"
                            onClick={() => requestConfirm('change-pin', 'Change PIN? All users will be logged out.', { newPin })}
                            disabled={!!actionLoading || !/^\d{4,8}$/.test(newPin)}
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

            <Dialog
                open={!!confirmAction}
                title="Confirm admin action"
                onClose={() => setConfirmAction(null)}
                className="confirm-modal"
            >
                        <AlertTriangle size={20} color="#f97316" />
                        <p className="confirm-text">{confirmAction?.label}</p>
                        <div className="confirm-buttons">
                            <button type="button" className="confirm-btn cancel" onClick={() => setConfirmAction(null)}>Cancel</button>
                            <button
                                type="button"
                                className="confirm-btn proceed"
                                onClick={() => confirmAction && adminAction(confirmAction.endpoint, confirmAction.body)}
                            >
                                Confirm
                            </button>
                        </div>
            </Dialog>
        </div>
    )
}
