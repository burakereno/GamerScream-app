import { useEffect, useState } from 'react'
import { CircleAlert, Download } from 'lucide-react'
import type { InstallUpdateResult, UpdateStatus } from '../types'

interface UpdateBannerProps {
    status: UpdateStatus
    installUpdate: () => Promise<InstallUpdateResult>
}

function displayVersion(version?: string): string | null {
    if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) return null
    return version
}

export function UpdateBanner({ status, installUpdate }: UpdateBannerProps) {
    const [installError, setInstallError] = useState<string | null>(null)
    const [installing, setInstalling] = useState(false)
    const version = displayVersion(status.version)

    useEffect(() => {
        setInstallError(null)
        setInstalling(false)
    }, [status.phase, status.version])

    if (status.phase === 'idle' || status.phase === 'checking' || status.phase === 'up-to-date') {
        return null
    }

    if (status.phase === 'error' || installError) {
        return (
            <div className="update-banner update-banner-error" role="alert">
                <CircleAlert size={14} aria-hidden="true" />
                <span>
                    {installError || status.error || 'The update could not be completed'}.
                    {' '}Restart GamerScream and try again.
                </span>
            </div>
        )
    }

    const downloaded = status.phase === 'downloaded'
    const percent = typeof status.percent === 'number' ? Math.round(status.percent) : null
    const versionLabel = version ? ` ${version}` : ''
    const accessibleLabel = downloaded
        ? `Restart to install GamerScream${versionLabel}`
        : `Downloading GamerScream${versionLabel}${percent === null ? '' : `, ${percent}%`}`

    return (
        <button
            type="button"
            className="update-banner"
            aria-label={accessibleLabel}
            aria-busy={!downloaded || installing}
            disabled={!downloaded || installing}
            onClick={async () => {
                setInstalling(true)
                const result = await installUpdate()
                if (!result.ok) {
                    setInstallError(result.error || 'The installer could not be started')
                    setInstalling(false)
                }
            }}
        >
            <Download size={14} aria-hidden="true" />
            {downloaded
                ? (installing ? 'Preparing restart…' : `v${version || 'new'} ready — restart to install`)
                : `Downloading v${version || 'new'}${percent === null ? '…' : ` — ${percent}%`}`}
        </button>
    )
}
