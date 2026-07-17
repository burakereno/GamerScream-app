import { ReactNode, RefObject, useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',')

interface DialogProps {
    open: boolean
    title: string
    onClose: () => void
    children: ReactNode
    className?: string
    initialFocusRef?: RefObject<HTMLElement | null>
    closeOnOverlay?: boolean
}

export function Dialog({
    open,
    title,
    onClose,
    children,
    className = '',
    initialFocusRef,
    closeOnOverlay = true
}: DialogProps) {
    const dialogRef = useRef<HTMLDivElement>(null)
    const openerRef = useRef<HTMLElement | null>(null)

    useEffect(() => {
        if (!open) return

        openerRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null

        const dialog = dialogRef.current
        const preferred = initialFocusRef?.current
        const firstFocusable = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
        ;(preferred || firstFocusable || dialog)?.focus()

        return () => {
            const opener = openerRef.current
            if (opener?.isConnected) opener.focus()
        }
    }, [initialFocusRef, open])

    if (!open) return null

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
            return
        }

        if (event.key !== 'Tab') return
        const focusable = Array.from(
            dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) || []
        )

        if (focusable.length === 0) {
            event.preventDefault()
            dialogRef.current?.focus()
            return
        }

        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
        }
    }

    return (
        <div
            className="dialog-overlay"
            onMouseDown={(event) => {
                if (closeOnOverlay && event.target === event.currentTarget) onClose()
            }}
        >
            <div
                ref={dialogRef}
                className={`dialog ${className}`.trim()}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                onKeyDown={handleKeyDown}
            >
                {children}
            </div>
        </div>
    )
}
