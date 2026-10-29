import { showClientError } from "@carlnotes/client/apiClient"
import { sendRemovePodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { type ComponentType, type ReactNode, useLayoutEffect, useMemo } from "react"
import { unloadPodcastEpisode } from "../stores/podcastEpisodePlayerStore"

export type RemovePodcastEpisodeDialogProps = {
	podcastEpisode: Pick<PodcastEpisode, "id" | "title" | "episodeNumber">
	onPodcastEpisodeRemoved: () => Promise<void> | void
	onClose: () => void
}
export type PodcastEpisodeRemovalConfirm = ComponentType<{
	title: string
	children: ReactNode
	confirmLabel: string
	cancelLabel: string
	onConfirm: () => Promise<void>
	onClose: () => void
}>

/**
 * Confirms one episode removal, unloads revoked audio, and refreshes the owning page after success.
 */
export function RemovePodcastEpisodeDialog({
	podcastEpisode,
	onPodcastEpisodeRemoved,
	onClose,
	Confirm,
	onRemoved,
	userId,
}: RemovePodcastEpisodeDialogProps & {
	Confirm: PodcastEpisodeRemovalConfirm
	onRemoved?: (id: string) => Promise<void>
	userId: string | null
}) {
	// retire confirmation callbacks whenever the account or episode changes
	const removal = useMemo(
		() => ({ userId, podcastEpisodeId: podcastEpisode.id, isActive: false, isPending: false }),
		[userId, podcastEpisode.id],
	)
	useLayoutEffect(() => {
		removal.isActive = true
		return () => {
			removal.isActive = false
		}
	}, [removal])

	// submit once and ignore results belonging to a retired dialog
	const handleRemove = async (): Promise<void> => {
		if (removal.isPending || !removal.isActive || !removal.userId) {
			return
		}
		removal.isPending = true
		try {
			const isPodcastEpisodeRemoved = await sendRemovePodcastEpisode(removal.podcastEpisodeId).catch(() => false)
			if (!removal.isActive) {
				return
			}
			if (!isPodcastEpisodeRemoved) {
				showClientError("That episode didn't budge. Carl suggests trying again.")
				return
			}

			// retire revoked audio before refreshing the page
			unloadPodcastEpisode(removal.podcastEpisodeId)
			await handleRefresh()
		} finally {
			removal.isPending = false
			if (removal.isActive) {
				onClose()
			}
		}
	}

	// report a refresh failure without treating the accepted deletion as failed
	async function handleRefresh(): Promise<void> {
		try {
			await onRemoved?.(removal.podcastEpisodeId)
			if (removal.isActive) {
				await onPodcastEpisodeRemoved()
			}
		} catch {
			if (removal.isActive) {
				showClientError("Episode removed. Reopen the page to see the change.")
			}
		}
	}
	const name =
		podcastEpisode.episodeNumber === null
			? `"${podcastEpisode.title}"`
			: `Episode ${podcastEpisode.episodeNumber}, "${podcastEpisode.title}",`
	return (
		<Confirm
			title="Remove this episode?"
			confirmLabel="Remove episode"
			cancelLabel="Keep it"
			onConfirm={handleRemove}
			onClose={onClose}
		>{`${name} leaves the topic page, every podcast feed, and its own page for good. Its number is not used again.`}</Confirm>
	)
}
