import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from '../components/Dialog'

describe('Dialog', () => {
    it('exposes modal semantics, traps focus, and closes on Escape', async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()

        render(
            <Dialog open title="Create channel" onClose={onClose}>
                <input aria-label="Channel name" />
                <button type="button">Create</button>
            </Dialog>
        )

        const dialog = screen.getByRole('dialog', { name: 'Create channel' })
        const input = screen.getByRole('textbox', { name: 'Channel name' })
        const create = screen.getByRole('button', { name: 'Create' })

        expect(dialog).toHaveAttribute('aria-modal', 'true')
        expect(input).toHaveFocus()

        await user.tab()
        expect(create).toHaveFocus()
        await user.tab()
        expect(input).toHaveFocus()
        await user.tab({ shift: true })
        expect(create).toHaveFocus()

        await user.keyboard('{Escape}')
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('returns focus to the opener after closing', async () => {
        const user = userEvent.setup()

        function Harness() {
            const [open, setOpen] = useState(false)
            return (
                <>
                    <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
                    <Dialog open={open} title="Example" onClose={() => setOpen(false)}>
                        <button type="button" onClick={() => setOpen(false)}>Done</button>
                    </Dialog>
                </>
            )
        }

        render(<Harness />)
        const opener = screen.getByRole('button', { name: 'Open dialog' })
        await user.click(opener)
        await user.click(screen.getByRole('button', { name: 'Done' }))
        expect(opener).toHaveFocus()
    })
})
