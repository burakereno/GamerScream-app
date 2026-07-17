import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UsernameEntry } from '../components/UsernameEntry'

describe('UsernameEntry', () => {
    it('shows server PIN errors instead of replacing them with Wrong PIN', async () => {
        const onSubmit = vi.fn()
        const onPinSubmit = vi.fn().mockResolvedValue('Too many attempts. Try again later.')

        render(
            <UsernameEntry
                onSubmit={onSubmit}
                savedUsername="Burak"
                needsPin={true}
                onPinSubmit={onPinSubmit}
            />
        )

        fireEvent.change(screen.getByLabelText('App PIN'), {
            target: { value: '8642' }
        })
        fireEvent.click(screen.getByRole('button', { name: /enter voice chat/i }))

        await waitFor(() => {
            expect(screen.getByText('Too many attempts. Try again later.')).toBeInTheDocument()
        })
        expect(onSubmit).not.toHaveBeenCalled()
    })
})
