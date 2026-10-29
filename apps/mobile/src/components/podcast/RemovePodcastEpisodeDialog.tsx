import { authClient } from "@carlnotes/client/authClient"
import {
	type RemovePodcastEpisodeDialogProps,
	RemovePodcastEpisodeDialog as SharedRemovePodcastEpisodeDialog,
} from "@carlnotes/core/components/RemovePodcastEpisodeDialog"
import { useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react-native"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { forgetRemovedPodcastEpisode } from "@/podcastEpisodeSession"

/**
 * Adapts shared episode removal to the system confirmation and account checkpoint cleanup.
 */
export function RemovePodcastEpisodeDialog(props: RemovePodcastEpisodeDialogProps) {
	const { data: session } = authClient().useSession()
	const queryClient = useQueryClient()
	const handleRemoved = async (id: string): Promise<void> => {
		await forgetRemovedPodcastEpisode(id)
		await queryClient.invalidateQueries({
			predicate: ({ queryKey }) =>
				["topic-page", "topic-feed", "mobile-podcast-season", "podcast-episode-page"].includes(String(queryKey[0])),
		})
	}
	return (
		<SharedRemovePodcastEpisodeDialog
			{...props}
			userId={session?.user.id ?? null}
			Confirm={ConfirmDialog}
			onRemoved={handleRemoved}
		/>
	)
}

/**
 * Opens episode removal with the same label and icon as the web row.
 */
export function RemovePodcastEpisodeButton({
	episodeNumber,
	onRemovePodcastEpisode,
}: {
	episodeNumber: number | null
	onRemovePodcastEpisode: () => void
}) {
	return (
		<Button
			variant="ghost"
			size="icon"
			accessibilityLabel={episodeNumber === null ? "Remove episode" : `Remove episode ${episodeNumber}`}
			onPress={onRemovePodcastEpisode}
		>
			<Icon as={Trash2} className="size-4 text-muted-foreground" />
		</Button>
	)
}
