import { describe, expect, it, vi } from 'vitest'
import { APP_ENTRY_URL, APP_SCHEME_PRIVILEGES, createAppProtocolHandler, resolveAppAssetPath } from '../../main/appProtocol'

describe('packaged app protocol', () => {
    it('registers a standard secure CORS-enabled origin without bypassing CSP', () => {
        expect(APP_ENTRY_URL).toBe('app://gamerscream/index.html')
        expect(APP_SCHEME_PRIVILEGES).toEqual({
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            codeCache: true
        })
        expect(APP_SCHEME_PRIVILEGES).not.toHaveProperty('bypassCSP')
    })

    it('resolves only assets under the packaged renderer root', () => {
        const root = '/Applications/GamerScream.app/Contents/Resources/app.asar/out/renderer'

        expect(resolveAppAssetPath(root, APP_ENTRY_URL)).toBe(`${root}/index.html`)
        expect(resolveAppAssetPath(root, 'app://gamerscream/assets/index.js')).toBe(`${root}/assets/index.js`)
        expect(resolveAppAssetPath(root, 'app://gamerscream/')).toBe(`${root}/index.html`)
        expect(resolveAppAssetPath(root, 'app://attacker/index.html')).toBeNull()
        expect(resolveAppAssetPath(root, 'file:///etc/passwd')).toBeNull()
        expect(resolveAppAssetPath(root, 'app://gamerscream/%2e%2e%2fsecret.txt')).toBeNull()
        expect(resolveAppAssetPath(root, 'app://gamerscream/assets/bad%00name.js')).toBeNull()
    })

    it('serves safe files and rejects invalid requests before file fetching', async () => {
        const fetchFile = vi.fn(async () => new Response('ok'))
        const handler = createAppProtocolHandler('/safe/renderer', fetchFile)

        await handler(new Request(APP_ENTRY_URL))
        expect(fetchFile).toHaveBeenCalledWith('file:///safe/renderer/index.html', 'GET')

        await handler(new Request(APP_ENTRY_URL, { method: 'HEAD' }))
        expect(fetchFile).toHaveBeenLastCalledWith('file:///safe/renderer/index.html', 'HEAD')

        const rejected = await handler(new Request('app://attacker/index.html'))
        expect(rejected.status).toBe(400)
        const rejectedMethod = await handler(new Request(APP_ENTRY_URL, { method: 'POST' }))
        expect(rejectedMethod.status).toBe(405)
        expect(rejectedMethod.headers.get('allow')).toBe('GET, HEAD')
        expect(fetchFile).toHaveBeenCalledTimes(2)
    })
})
