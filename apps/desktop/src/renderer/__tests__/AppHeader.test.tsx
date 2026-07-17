import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppHeader } from '../components/app-shell/AppHeader'

describe('AppHeader', () => {
    it('exposes selected tab state and reports Settings selection', async () => {
        const user = userEvent.setup()
        const onTabChange = vi.fn()
        render(
            <AppHeader
                updateStatus={{ phase: 'idle' }}
                installUpdate={async () => ({ ok: false, error: 'No update' })}
                activeTab="channels"
                onTabChange={onTabChange}
            />
        )

        expect(screen.getByRole('tab', { name: 'Channels' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'false')

        await user.click(screen.getByRole('tab', { name: 'Settings' }))
        expect(onTabChange).toHaveBeenCalledWith('settings')
    })
})
