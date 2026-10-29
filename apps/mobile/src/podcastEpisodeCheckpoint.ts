import type { PodcastEpisodePlayerState } from "@carlnotes/core/lib/podcastEpisodeAudio"
import { PLAYBACK_RATES } from "@carlnotes/core/lib/podcastEpisodePlayback"
import type { QueryCacheStorage } from "./queryCache"

export type PodcastEpisodeCheckpoint = {
	version: 1
	podcastEpisodeId: string
	positionSeconds: number
	playbackRate: number
	isCompleted: boolean
	savedAt: number
}
export type PodcastEpisodeCheckpointStore = {
	read: () => Promise<PodcastEpisodeCheckpoint | null>
	save: (state: PodcastEpisodePlayerState) => void
	clear: () => Promise<void>
	forget: (podcastEpisodeId?: string) => Promise<void>
	retire: () => void
}

/**
 * Owns one account's ordered, URL-free playback checkpoint writes.
 */
export function createPodcastEpisodeCheckpointStore({
	storage,
	userId,
}: {
	storage: QueryCacheStorage
	userId: string
}): PodcastEpisodeCheckpointStore {
	// serialize playback saves for this account
	const key = `carlnotes:podcast:${userId}`
	let isActive = true
	let writes = Promise.resolve()
	return {
		read: async () => {
			try {
				// read only after earlier saves settle
				await writes
				const raw = await storage.getItem(key)
				return isActive ? toPodcastEpisodeCheckpoint(raw) : null
			} catch {
				return null
			}
		},
		save: (state) => {
			if (!isActive || !state.podcastEpisode) {
				return
			}
			// persist only the fields needed to resume
			const checkpoint: PodcastEpisodeCheckpoint = {
				version: 1,
				podcastEpisodeId: state.podcastEpisode.id,
				positionSeconds: Math.max(0, state.positionSeconds),
				playbackRate: state.playbackRate,
				isCompleted: state.podcastEpisode.isCompleted,
				savedAt: Date.now(),
			}
			writes = writes.then(() => storage.setItem(key, JSON.stringify(checkpoint))).catch(() => {})
		},
		forget: (podcastEpisodeId) => {
			// order removal before any newly selected episode's checkpoint
			writes = writes
				.then(async () => {
					const savedCheckpoint = toPodcastEpisodeCheckpoint(await storage.getItem(key))
					if (!podcastEpisodeId || savedCheckpoint?.podcastEpisodeId === podcastEpisodeId) {
						await storage.removeItem(key)
					}
				})
				.catch(() => {})
			return writes
		},
		clear: async () => {
			// retire the account before removing its last saved position
			isActive = false
			await writes
			await storage.removeItem(key).catch(() => {})
		},
		retire: () => {
			isActive = false
		},
	}
}

/**
 * Validates stored resume fields without retaining unknown data or media credentials.
 */
export function toPodcastEpisodeCheckpoint(raw: string | null): PodcastEpisodeCheckpoint | null {
	try {
		// validate stored fields before restoring playback
		const parsedCheckpoint = JSON.parse(raw ?? "null") as Partial<PodcastEpisodeCheckpoint> | null
		if (
			parsedCheckpoint?.version !== 1 ||
			typeof parsedCheckpoint.podcastEpisodeId !== "string" ||
			!parsedCheckpoint.podcastEpisodeId ||
			typeof parsedCheckpoint.positionSeconds !== "number" ||
			!Number.isFinite(parsedCheckpoint.positionSeconds) ||
			parsedCheckpoint.positionSeconds < 0 ||
			typeof parsedCheckpoint.playbackRate !== "number" ||
			!PLAYBACK_RATES.includes(parsedCheckpoint.playbackRate) ||
			typeof parsedCheckpoint.isCompleted !== "boolean" ||
			typeof parsedCheckpoint.savedAt !== "number" ||
			!Number.isFinite(parsedCheckpoint.savedAt)
		) {
			return null
		}
		return {
			version: 1,
			podcastEpisodeId: parsedCheckpoint.podcastEpisodeId,
			positionSeconds: parsedCheckpoint.positionSeconds,
			playbackRate: parsedCheckpoint.playbackRate,
			isCompleted: parsedCheckpoint.isCompleted,
			savedAt: parsedCheckpoint.savedAt,
		}
	} catch {
		return null
	}
}
