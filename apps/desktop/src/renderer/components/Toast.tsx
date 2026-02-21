import { useState, useCallback, useRef, useEffect } from 'react'

export interface Toast {
    id: number
    message: string
    type: 'join' | 'leave'
}

export function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([])
    const counterRef = useRef(0)

    const addToast = useCallback((message: string, type: 'join' | 'leave') => {
        const id = ++counterRef.current
        setToasts(prev => [...prev, { id, message, type }])
        // Auto-remove after 5 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, 5000)
    }, [])

    return { toasts, addToast }
}

export function ToastContainer({ toasts }: { toasts: Toast[] }) {
    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} />
            ))}
        </div>
    )
}

function ToastItem({ toast }: { toast: Toast }) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        // Trigger enter animation
        requestAnimationFrame(() => setVisible(true))
        // Trigger exit animation before removal
        const timer = setTimeout(() => setVisible(false), 4500)
        return () => clearTimeout(timer)
    }, [])

    return (
        <div className={`toast toast-${toast.type} ${visible ? 'toast-visible' : ''}`}>
            <span className={`toast-dot ${toast.type === 'join' ? 'dot-join' : 'dot-leave'}`} />
            <span className="toast-text">{toast.message}</span>
        </div>
    )
}
