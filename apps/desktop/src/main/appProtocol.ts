import { isAbsolute, relative, resolve, sep } from 'path'
import { pathToFileURL } from 'url'

export const APP_SCHEME = 'app'
export const APP_HOST = 'gamerscream'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
export const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`
export const APP_SCHEME_PRIVILEGES = {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    codeCache: true
}

export function resolveAppAssetPath(rendererRoot: string, requestUrl: string): string | null {
    try {
        const url = new URL(requestUrl)
        if (url.protocol !== `${APP_SCHEME}:` ||
            url.host !== APP_HOST ||
            url.username ||
            url.password) return null

        const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
        if (pathname.includes('\0')) return null
        const pathToServe = resolve(rendererRoot, `.${pathname}`)
        const relativePath = relative(rendererRoot, pathToServe)
        const isSafe = relativePath.length > 0 &&
            relativePath !== '..' &&
            !relativePath.startsWith(`..${sep}`) &&
            !isAbsolute(relativePath)
        return isSafe ? pathToServe : null
    } catch {
        return null
    }
}

export function createAppProtocolHandler(
    rendererRoot: string,
    fetchFile: (fileUrl: string, method: 'GET' | 'HEAD') => Promise<Response>
): (request: Request) => Promise<Response> {
    return async (request) => {
        const method = request.method.toUpperCase()
        if (method !== 'GET' && method !== 'HEAD') {
            return new Response('Method not allowed', {
                status: 405,
                headers: {
                    allow: 'GET, HEAD',
                    'content-type': 'text/plain; charset=utf-8'
                }
            })
        }
        const assetPath = resolveAppAssetPath(rendererRoot, request.url)
        if (!assetPath) {
            return new Response('Bad app asset request', {
                status: 400,
                headers: { 'content-type': 'text/plain; charset=utf-8' }
            })
        }
        return fetchFile(pathToFileURL(assetPath).toString(), method)
    }
}
