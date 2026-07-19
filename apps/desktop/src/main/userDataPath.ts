import { join } from 'node:path'

export const STABLE_USER_DATA_DIRECTORY = 'desktop'

interface UserDataPathApp {
    getPath(name: 'appData'): string
    setPath(name: 'userData', path: string): void
}

export function configurePersistentUserDataPath(app: UserDataPathApp): void {
    app.setPath('userData', join(app.getPath('appData'), STABLE_USER_DATA_DIRECTORY))
}
