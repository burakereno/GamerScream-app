import '@testing-library/jest-dom/vitest'

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {}
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value },
        removeItem: (key: string) => { delete store[key] },
        clear: () => { store = {} }
    }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock crypto.randomUUID
Object.defineProperty(window, 'crypto', {
    value: {
        randomUUID: () => 'test-device-id-1234'
    }
})

// Mock import.meta.env
Object.defineProperty(import.meta, 'env', {
    value: { VITE_SERVER_URL: 'http://localhost:3002' }
})

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', {
    value: {
        onUpdateAvailable: () => { },
        onUpdateDownloaded: () => { },
        onUpdateStatus: () => () => { },
        getUpdateStatus: async () => ({ phase: 'idle' }),
        installUpdate: async () => ({ ok: false, error: 'No update in tests' }),
        getAppVersion: async () => '2.7.2',
        showNotification: () => { },
        getPlayerVolumes: async () => null,
        setPlayerVolumes: async () => true
    }
})
