import type { InstallUpdateResult, UpdateStatus } from '../../types'
import { UpdateBanner } from '../UpdateBanner'
import type { AppTab } from './types'
import logoSvg from '../../assets/logo.svg'

interface AppHeaderProps {
    updateStatus: UpdateStatus
    installUpdate: () => Promise<InstallUpdateResult>
    activeTab: AppTab
    onTabChange: (tab: AppTab) => void
}

export function AppHeader({
    updateStatus,
    installUpdate,
    activeTab,
    onTabChange
}: AppHeaderProps) {
    return (
        <div className="app-header-bar">
            <UpdateBanner status={updateStatus} installUpdate={installUpdate} />

            <div className="drag-handle">
                <div className="app-header">
                    <img src={logoSvg} alt="GamerScream" className="app-logo" />
                </div>
            </div>

            <div className="segmented-control" role="tablist" aria-label="Main sections">
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'channels'}
                    aria-controls="channels-panel"
                    className={`segmented-btn ${activeTab === 'channels' ? 'segmented-btn-active' : ''}`}
                    onClick={() => onTabChange('channels')}
                >
                    Channels
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'settings'}
                    aria-controls="settings-panel"
                    className={`segmented-btn ${activeTab === 'settings' ? 'segmented-btn-active' : ''}`}
                    onClick={() => onTabChange('settings')}
                >
                    Settings
                </button>
            </div>
        </div>
    )
}
