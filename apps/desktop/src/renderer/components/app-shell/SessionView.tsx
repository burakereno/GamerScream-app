import { CircleAlert } from 'lucide-react'
import { SessionControls } from '../SessionControls'
import type { SessionControlsProps } from '../session-controls/types'

interface SessionViewProps extends SessionControlsProps {
    connectError: string | null
}

export function SessionView({ connectError, ...sessionProps }: SessionViewProps) {
    return (
        <section id="channels-panel" role="tabpanel" aria-label="Channels">
            <SessionControls {...sessionProps} />

            {connectError && (
                <div className="error-banner" role="alert">
                    <CircleAlert size={15} aria-hidden="true" /> {connectError}
                </div>
            )}
        </section>
    )
}
