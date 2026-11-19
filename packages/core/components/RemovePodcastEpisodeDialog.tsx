import { showClientError } from "@carlnotes/client/apiClient"
import { sendRemovePodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { type ComponentType, type ReactNode, useContext, useLayoutEffect, useMemo, useState } from "react"
import { podcastEpisodeAccountSignal } from "../stores/podcastEpisodeListenStore"
import { unloadPodcastEpisode } from "../stores/podcastEpisodePlayerStore"

import { PodcastEpisodeRemovalContext } from "./PodcastEpisodeRemovalProvider"

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
	const { setEpisodeHidden } = useContext(PodcastEpisodeRemovalContext)
	const [confirmedRemoval, setConfirmedRemoval] = useState<object | null>(null)

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
		const accountSignal = podcastEpisodeAccountSignal(removal.userId)
		removal.isPending = true
		setConfirmedRemoval(removal)
		setEpisodeHidden(removal.podcastEpisodeId, true)
		try {
			const isPodcastEpisodeRemoved = await sendRemovePodcastEpisode(removal.podcastEpisodeId).catch(() => false)
			if (!isPodcastEpisodeRemoved) {
				setEpisodeHidden(removal.podcastEpisodeId, false)
			}
			if (accountSignal?.aborted || (!removal.isActive && !accountSignal)) {
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
	if (confirmedRemoval === removal) {
		return null
	}
	const name =
		podcastEpisode.episodeNumber === null
			? `"${podcastEpisode.title}"`
			: `Podcast episode ${podcastEpisode.episodeNumber}, "${podcastEpisode.title}",`
	return (
		<Confirm
			title="Remove this podcast episode?"
			confirmLabel="Remove podcast episode"
			cancelLabel="Keep it"
			onConfirm={handleRemove}
			onClose={() => {
				if (!removal.isPending) {
					onClose()
				}
			}}
		>{`${name} leaves the topic page, every podcast feed, and its own page for good. Its number is not used again.`}</Confirm>
	)
}
