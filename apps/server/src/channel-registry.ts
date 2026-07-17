import crypto from 'crypto'
import { hashPinAsync, verifyPinHashAsync } from './pin-security.js'

export interface CustomChannel {
    name: string
    roomName: string
    pinHash?: string
    createdBy: string
    createdAt: number
    emptySince?: number
}

export interface LiveRoom {
    name: string
    numParticipants: number
}

export interface ChannelInfo {
    channel?: number
    name: string
    roomName?: string
    playerCount: number
    hasPin?: boolean
    isCustom?: boolean
    createdBy?: string
}

export class ChannelRegistry {
    private readonly channels = new Map<string, CustomChannel>()
    private readonly capabilities = new Map<string, { sessionJti: string; roomName: string; expiresAt: number }>()
    private readonly authorizations = new Map<string, Set<string>>()
    private pendingProtectedCreations = 0

    get size(): number {
        return this.channels.size
    }

    get(roomName: string): CustomChannel | undefined {
        return this.channels.get(roomName)
    }

    isKnown(roomName: string): boolean {
        return /^ch-[1-5]$/.test(roomName) || this.channels.has(roomName)
    }

    async create(name: string, pin: string | undefined, createdBy: string, sessionJti: string) {
        if (this.channels.size + this.pendingProtectedCreations >= 50 ||
            (pin && this.pendingProtectedCreations >= 8)) return null
        if (pin) this.pendingProtectedCreations++
        try {
            const pinHash = pin ? await hashPinAsync(pin) : undefined
            if (this.channels.size >= 50) return null
            const roomName = `custom-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`
            const channel: CustomChannel = {
                name,
                roomName,
                pinHash,
                createdBy,
                createdAt: Date.now()
            }
            this.channels.set(roomName, channel)
            return {
                name,
                roomName,
                hasPin: Boolean(pin),
                ...(pin ? { roomCapability: this.issueCapability(sessionJti, roomName) } : {})
            }
        } finally {
            if (pin) this.pendingProtectedCreations = Math.max(0, this.pendingProtectedCreations - 1)
        }
    }

    async verifyPin(roomName: string, pin: string): Promise<boolean> {
        const channel = this.channels.get(roomName)
        if (!channel?.pinHash) return channel !== undefined
        return verifyPinHashAsync(pin, channel.pinHash)
    }

    issueCapability(sessionJti: string, roomName: string): string {
        this.pruneCapabilities()
        if (this.capabilities.size >= 1_000) {
            const oldest = this.capabilities.keys().next().value
            if (oldest) this.capabilities.delete(oldest)
        }
        const token = crypto.randomBytes(32).toString('base64url')
        this.capabilities.set(token, { sessionJti, roomName, expiresAt: Date.now() + 60_000 })
        return token
    }

    authorizeJoin(sessionJti: string, roomName: string, capability: unknown): boolean {
        const channel = this.channels.get(roomName)
        if (!channel) return /^ch-[1-5]$/.test(roomName)
        if (!channel.pinHash) {
            channel.emptySince = undefined
            return true
        }
        if (this.authorizations.get(sessionJti)?.has(roomName)) {
            channel.emptySince = undefined
            return true
        }
        if (typeof capability !== 'string') return false
        const stored = this.capabilities.get(capability)
        if (!stored || stored.expiresAt <= Date.now() ||
            stored.sessionJti !== sessionJti || stored.roomName !== roomName) return false
        this.capabilities.delete(capability)
        if (!this.authorizations.has(sessionJti) && this.authorizations.size >= 5_000) {
            const oldest = this.authorizations.keys().next().value
            if (oldest) this.authorizations.delete(oldest)
        }
        const rooms = this.authorizations.get(sessionJti) || new Set<string>()
        rooms.add(roomName)
        this.authorizations.set(sessionJti, rooms)
        channel.emptySince = undefined
        return true
    }

    canViewPlayers(sessionJti: string, roomName: string): boolean {
        const channel = this.channels.get(roomName)
        return !channel?.pinHash || this.authorizations.get(sessionJti)?.has(roomName) === true
    }

    buildRoomList(liveRooms: LiveRoom[]): { rooms: ChannelInfo[]; deletedRoomNames: string[] } {
        const byName = new Map(liveRooms.map(room => [room.name, room]))
        const rooms: ChannelInfo[] = [1, 2, 3, 4, 5].map(channel => ({
            channel,
            name: `ch-${channel}`,
            playerCount: byName.get(`ch-${channel}`)?.numParticipants || 0
        }))
        const deletedRoomNames: string[] = []
        const now = Date.now()
        for (const [roomName, channel] of this.channels) {
            const count = byName.get(roomName)?.numParticipants || 0
            if (count > 0) {
                channel.emptySince = undefined
            } else if (channel.emptySince === undefined) {
                channel.emptySince = now
            } else if (now - channel.emptySince >= 10_000) {
                deletedRoomNames.push(roomName)
                continue
            }
            rooms.push({
                name: channel.name,
                roomName,
                playerCount: count,
                hasPin: Boolean(channel.pinHash),
                isCustom: true,
                createdBy: channel.createdBy
            })
        }
        for (const roomName of deletedRoomNames) this.deleteRoom(roomName)
        return { rooms, deletedRoomNames }
    }

    clearAuthorizations(): void {
        this.capabilities.clear()
        this.authorizations.clear()
    }

    reset(): void {
        this.channels.clear()
        this.pendingProtectedCreations = 0
        this.clearAuthorizations()
    }

    private deleteRoom(roomName: string): void {
        this.channels.delete(roomName)
        for (const [token, capability] of this.capabilities) {
            if (capability.roomName === roomName) this.capabilities.delete(token)
        }
        for (const rooms of this.authorizations.values()) rooms.delete(roomName)
    }

    private pruneCapabilities(): void {
        const now = Date.now()
        for (const [token, capability] of this.capabilities) {
            if (capability.expiresAt <= now) this.capabilities.delete(token)
        }
    }
}
