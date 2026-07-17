import { beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    tokenRecords: [] as Array<{
        options: Record<string, unknown>
        grant?: Record<string, unknown>
    }>,
    state: {
        rooms: [] as Array<{ name: string; numParticipants: number }>,
        participants: new Map<string, Array<{ identity: string; name?: string }>>(),
        listRoomsError: null as Error | null,
        removed: [] as Array<{ room: string; identity: string }>,
        updated: [] as Array<{ room: string; identity: string; options: { metadata: string } }>,
        removeErrors: new Set<string>(),
        onRemove: null as (() => void) | null
    }
}))

export const liveKitTokenRecords = mocks.tokenRecords
export const liveKitState = mocks.state

vi.mock('livekit-server-sdk', () => {
    class MockAccessToken {
        private record: { options: Record<string, unknown>; grant?: Record<string, unknown> }

        constructor(_key: string, _secret: string, options: Record<string, unknown>) {
            this.record = { options }
            mocks.tokenRecords.push(this.record)
        }

        addGrant = vi.fn((grant: Record<string, unknown>) => { this.record.grant = grant })
        toJwt = vi.fn().mockResolvedValue('mock-livekit-jwt')
    }

    class MockRoomServiceClient {
        listRooms = vi.fn(async () => {
            if (mocks.state.listRoomsError) throw mocks.state.listRoomsError
            return mocks.state.rooms
        })
        listParticipants = vi.fn(async (room: string) => mocks.state.participants.get(room) || [])
        removeParticipant = vi.fn(async (room: string, identity: string) => {
            mocks.state.onRemove?.()
            if (mocks.state.removeErrors.has(identity)) throw new Error('remove failed')
            mocks.state.removed.push({ room, identity })
        })
        updateParticipant = vi.fn(async (room: string, identity: string, options: { metadata: string }) => {
            mocks.state.updated.push({ room, identity, options })
            return { identity }
        })
    }

    return {
        AccessToken: MockAccessToken,
        RoomServiceClient: MockRoomServiceClient,
        TrackSource: { MICROPHONE: 'microphone' }
    }
})

const server = await import('../index')

export const app = server.app
export const generateAccessToken = server.generateAccessToken
export const isValidAccessToken = server.isValidAccessToken
export const setAdminStateStoreForTests = server.setAdminStateStoreForTests

export function getAccessToken(): string {
    return server.generateAccessToken()
}

beforeEach(() => {
    server.resetState()
    liveKitTokenRecords.length = 0
    liveKitState.rooms = []
    liveKitState.participants.clear()
    liveKitState.listRoomsError = null
    liveKitState.removed.length = 0
    liveKitState.updated.length = 0
    liveKitState.removeErrors.clear()
    liveKitState.onRemove = null
})
