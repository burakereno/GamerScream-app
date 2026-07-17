import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminPanel } from '../components/AdminPanel'

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    })
}

describe('AdminPanel', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('warns with meaningful counts when kicking everyone only partially succeeds', async () => {
        const user = userEvent.setup()
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse({ valid: true }))
            .mockResolvedValueOnce(jsonResponse({
                success: false,
                kicked: 3,
                failed: 1,
                message: 'Some active participants could not be removed.'
            }, 207))
        vi.stubGlobal('fetch', fetchMock)

        render(<AdminPanel onClose={vi.fn()} />)

        await user.type(screen.getByLabelText('Admin secret'), 'correct-secret')
        await user.click(screen.getByRole('button', { name: 'Verify' }))
        await user.click(await screen.findByRole('button', { name: 'Kick Everyone' }))
        await user.click(screen.getByRole('button', { name: 'Confirm' }))

        const warning = await screen.findByRole('alert')
        expect(warning).toHaveTextContent('Some active participants could not be removed.')
        expect(warning).toHaveTextContent('Participants removed: 3')
        expect(warning).toHaveTextContent('LiveKit operations failed: 1')
    })
})
