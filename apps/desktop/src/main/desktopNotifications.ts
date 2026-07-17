import { BrowserWindow, Notification as ElectronNotification, screen } from 'electron'
import { createOverlayLifecycle } from './overlayLifecycle'

type OverlayType = 'join' | 'leave' | 'mute' | 'unmute'

const OVERLAY_CONFIG: Record<OverlayType, { action: string; nameColor: string; iconColor: string; svg: string }> = {
    join: {
        action: 'joined',
        nameColor: '#22c55e',
        iconColor: '#22c55e',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/></svg>'
    },
    leave: {
        action: 'left',
        nameColor: '#ef4444',
        iconColor: '#ef4444',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 13"/></svg>'
    },
    mute: {
        action: 'muted',
        nameColor: '#a1a1aa',
        iconColor: '#a1a1aa',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
    },
    unmute: {
        action: 'unmuted',
        nameColor: '#f97316',
        iconColor: '#f97316',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
    }
}

export interface DesktopNotificationPresenter {
    show(title: string, body: string): void
}

export function createDesktopNotificationPresenter(): DesktopNotificationPresenter {
    const overlayLifecycle = createOverlayLifecycle<BrowserWindow>()

    const showOverlay = (name: string, type: OverlayType): void => {
        const { width } = screen.getPrimaryDisplay().workAreaSize
        const overlayWidth = 280
        const overlayHeight = 60
        const notificationWindow = overlayLifecycle.show(() => new BrowserWindow({
            width: overlayWidth,
            height: overlayHeight,
            x: width - overlayWidth - 20,
            y: 20,
            frame: false,
            transparent: true,
            show: false,
            skipTaskbar: true,
            focusable: false,
            resizable: false,
            hasShadow: false,
            backgroundColor: '#00000000',
            ...(process.platform === 'win32' ? { type: 'toolbar' as const, roundedCorners: false } : {}),
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                webSecurity: true
            }
        }), 5000)

        notificationWindow.setIgnoreMouseEvents(true)
        notificationWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
        notificationWindow.once('ready-to-show', () => {
            if (notificationWindow.isDestroyed()) return
            notificationWindow.setAlwaysOnTop(true, 'pop-up-menu')
            notificationWindow.showInactive()
        })

        const config = OVERLAY_CONFIG[type]
        const safeName = name.replace(/[&<>"']/g, character => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character
        ))
        const html = `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-app-region:no-drag;user-select:none}
.overlay{display:flex;align-items:center;gap:10px;padding:12px 18px;background:rgba(15,15,18,0.95);border-radius:12px;color:#e4e4e7;font-size:14px;font-weight:500;animation:slideIn .3s ease-out}
.overlay.leaving{animation:slideOut .3s ease-in forwards}
.icon{flex-shrink:0;display:flex;align-items:center;color:${config.iconColor}}
.name{color:${config.nameColor};font-weight:600}
@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:0}}
</style></head><body>
<div class="overlay" id="overlay"><span class="icon">${config.svg}</span><span><span class="name">${safeName}</span> ${config.action}</span></div>
<script>setTimeout(()=>{document.getElementById('overlay').classList.add('leaving')},4700)</script>
</body></html>`
        notificationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    }

    return {
        show: (title, body) => {
            if (process.platform === 'darwin') {
                new ElectronNotification({ title, body }).show()
                return
            }

            let type: OverlayType = 'join'
            if (body.includes('unmuted')) type = 'unmute'
            else if (body.includes('muted')) type = 'mute'
            else if (body.includes('left')) type = 'leave'
            const name = body.replace(/^[🔇🎤\s]+/, '').replace(/\s*(joined|left|muted|unmuted).*/, '').trim() || title
            showOverlay(name, type)
        }
    }
}
