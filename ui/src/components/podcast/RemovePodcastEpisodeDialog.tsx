import type { PodcastEpisode } from "@shared/contracts"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { sendRemovePodcastEpisode } from "@/clients/podcastEpisodeClient"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { cn } from "@/lib/utils"
import { unloadPodcastEpisode } from "@/stores/podcastEpisodePlayerStore"

/**
 * The dialog that confirms removing a podcast episode, then removes the episode and unloads the episode from the player.
 */
export function RemovePodcastEpisodeDialog({
	podcastEpisode,
	onPodcastEpisodeRemoved,
	onClose,
}: {
	podcastEpisode: Pick<PodcastEpisode, "id" | "title" | "episodeNumber">
	onPodcastEpisodeRemoved: () => Promise<void> | void
	onClose: () => void
}) {
	// remove the podcast episode and close the dialog. on success, unload the podcast episode from the player and call
	// onPodcastEpisodeRemoved, or else show an error toast
	const handleRemovePodcastEpisode = async (): Promise<void> => {
		const isPodcastEpisodeRemoved = await sendRemovePodcastEpisode(podcastEpisode.id).catch(() => false)
		onClose()
		if (!isPodcastEpisodeRemoved) {
			toast.error("That episode didn't budge. Carl suggests trying again.")
			return
		}
		unloadPodcastEpisode(podcastEpisode.id)
		await onPodcastEpisodeRemoved()
	}
	return (
		<ConfirmDialog
			title="Remove this episode?"
			confirmLabel="Remove episode"
			cancelLabel="Keep it"
			onConfirm={() => void handleRemovePodcastEpisode()}
			onClose={onClose}
		>
			{`${toPodcastEpisodeName(podcastEpisode)} leaves the topic page, every podcast feed, and its own page for good. Its number is not used again.`}
		</ConfirmDialog>
	)
}

/**
 * The trash button that opens the remove dialog for a podcast episode.
 */
export function RemovePodcastEpisodeButton({
	episodeNumber,
	className,
	onRemovePodcastEpisode,
}: {
	episodeNumber: number | null
	className?: string
	onRemovePodcastEpisode: () => void
}) {
	return (
		<button
			type="button"
			aria-label={episodeNumber === null ? "Remove episode" : `Remove episode ${episodeNumber}`}
			onClick={onRemovePodcastEpisode}
			className={cn(
				"text-muted-foreground hover:text-destructive grid size-11 shrink-0 place-items-center sm:size-9",
				className,
			)}
		>
			<Trash2 className="size-4" />
		</button>
	)
}

// the episode's number and title, or its title alone if the episode has no number
function toPodcastEpisodeName(podcastEpisode: Pick<PodcastEpisode, "title" | "episodeNumber">): string {
	return podcastEpisode.episodeNumber === null
		? `"${podcastEpisode.title}"`
		: `Episode ${podcastEpisode.episodeNumber}, "${podcastEpisode.title}",`
}
