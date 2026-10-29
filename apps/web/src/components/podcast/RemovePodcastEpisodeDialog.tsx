import { authClient } from "@carlnotes/client/authClient"
import {
	type RemovePodcastEpisodeDialogProps,
	RemovePodcastEpisodeDialog as SharedRemovePodcastEpisodeDialog,
} from "@carlnotes/core/components/RemovePodcastEpisodeDialog"
import { cn } from "@carlnotes/nightshift/classNames"
import { Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"

/**
 * Adapts shared episode removal to the browser's confirmation dialog.
 */
export function RemovePodcastEpisodeDialog(props: RemovePodcastEpisodeDialogProps) {
	const { data: session } = authClient().useSession()
	return <SharedRemovePodcastEpisodeDialog {...props} userId={session?.user.id ?? null} Confirm={ConfirmDialog} />
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
