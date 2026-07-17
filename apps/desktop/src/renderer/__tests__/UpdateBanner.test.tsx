import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UpdateBanner } from '../components/UpdateBanner'

vi.mock('lucide-react', () => ({
    Download: () => <span aria-hidden="true" />,
    CircleAlert: () => <span aria-hidden="true" />
}))

describe('UpdateBanner', () => {
    it('shows progress and only enables installation for a downloaded update', async () => {
        const user = userEvent.setup()
        const installUpdate = vi.fn(async () => ({ ok: true }))
        const { rerender } = render(
            <UpdateBanner
                status={{ phase: 'downloading', version: '2.8.0', percent: 42 }}
                installUpdate={installUpdate}
            />
        )

        expect(screen.getByRole('button', { name: /Downloading GamerScream 2.8.0/i })).toBeDisabled()
        expect(screen.getByText(/42%/)).toBeInTheDocument()

        rerender(
            <UpdateBanner
                status={{ phase: 'downloaded', version: '2.8.0', percent: 100 }}
                installUpdate={installUpdate}
            />
        )
        await user.click(screen.getByRole('button', { name: /Restart to install GamerScream 2.8.0/i }))
        expect(installUpdate).toHaveBeenCalledTimes(1)
    })

    it('gives a recovery action when installation cannot start', async () => {
        const user = userEvent.setup()
        render(
            <UpdateBanner
                status={{ phase: 'downloaded', version: '2.8.0' }}
                installUpdate={async () => ({ ok: false, error: 'Update is not ready to install' })}
            />
        )

        await user.click(screen.getByRole('button', { name: /Restart to install/i }))
        expect(await screen.findByRole('alert')).toHaveTextContent('Update is not ready to install')
        expect(screen.getByRole('alert')).toHaveTextContent('Restart GamerScream and try again')
    })
})
