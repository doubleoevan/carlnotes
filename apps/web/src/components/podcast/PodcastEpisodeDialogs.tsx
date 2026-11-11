import {
	sendPodcastEpisodeHomeOrder,
	sendTopicPodcastEpisodeVideoHomeOrder,
} from "@carlnotes/client/podcastEpisodeClient"
import { type PodcastEpisode, toHomePodcastEpisodeLabel } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { toPodcastEpisodeTitleLabel } from "@carlnotes/core/lib/labels"
import {
	toPodcastEpisodeEditableImage,
	toTopicPodcastEpisodeVideoEditableImage,
} from "@carlnotes/core/lib/podcastEpisodeEditor"
import { type PinnedOrderMove, toHomeRankDialogLabels } from "@carlnotes/core/lib/rankDialog"
import { SAVE_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { toast } from "sonner"
import { ProfileRankDialog, RankDialog } from "@/components/common/RankDialog"
import { ShareTopic } from "@/components/share/ShareTopic"
import { AddTopicToTeamDialog } from "@/components/team/AddTopicToTeamDialog"
import { EditImageDialog } from "@/components/topic/EditImageDialog"
import { sendPinnedOrderMoves } from "@/lib/pinnedOrderMoves"
import { EditPodcastEpisodeDialog } from "./EditPodcastEpisodeDialog"
import { RemovePodcastEpisodeDialog } from "./RemovePodcastEpisodeDialog"

// the dialogs that the podcast episode page's actions menu and header image open, one at a time
export type PodcastEpisodeDialog =
	| "share"
	| "add-topic-to-team"
	| "edit"
	| "edit-film"
	| "edit-image"
	| "rank"
	| "rank-films"
	| "rank-profile"
	| "rank-profile-films"
	| "remove"

// the loaded page, the open dialog, and the calls after a change, after the podcast episode is gone, and on close
type PodcastEpisodeDialogsProps = {
	podcastEpisodePage: PodcastEpisodePageResponse
	openDialog: PodcastEpisodeDialog | null
	onOpenDialog: (podcastEpisodeDialog: PodcastEpisodeDialog | null) => void
	onPodcastEpisodePageChanged: () => void
	onPodcastEpisodeRemoved: () => void
}

/**
 * A podcast episode page's dialogs, one at a time. Each mounts only while it is the open one, and its state resets
 * every time.
 */
export function PodcastEpisodeDialogs({
	podcastEpisodePage,
	openDialog,
	onOpenDialog,
	onPodcastEpisodePageChanged,
	onPodcastEpisodeRemoved,
}: PodcastEpisodeDialogsProps) {
	const { topic, podcastEpisode } = podcastEpisodePage
	const handleClose = (): void => onOpenDialog(null)
	return (
		<>
			{/* the actions menu's share and Add topic to team dialogs, both of the podcast episode's topic */}
			{openDialog === "share" && <ShareTopic topic={topic} isDialog onClose={handleClose} />}
			{openDialog === "add-topic-to-team" && (
				<AddTopicToTeamDialog topic={topic} onTopicTeamsChanged={onPodcastEpisodePageChanged} onClose={handleClose} />
			)}
			{/* the actions menu's Edit podcast dialog */}
			{openDialog === "edit" && (
				<EditPodcastEpisodeDialog
					podcastEpisodePage={podcastEpisodePage}
					onPodcastEpisodeChanged={onPodcastEpisodePageChanged}
					onClose={handleClose}
				/>
			)}
			<PodcastEpisodeImageDialog
				openDialog={openDialog}
				podcastEpisodePage={podcastEpisodePage}
				onImageChanged={onPodcastEpisodePageChanged}
				onClose={handleClose}
			/>
			<PodcastEpisodeHomeRankDialog
				openDialog={openDialog}
				podcastEpisodePage={podcastEpisodePage}
				onRanked={onPodcastEpisodePageChanged}
				onClose={handleClose}
			/>
			<PodcastEpisodeProfileRankDialog openDialog={openDialog} podcastEpisode={podcastEpisode} onClose={handleClose} />
			{/* the actions menu's remove dialog. a removed podcast episode opens its topic's page */}
			{openDialog === "remove" && (
				<RemovePodcastEpisodeDialog
					podcastEpisode={podcastEpisode}
					onPodcastEpisodeRemoved={onPodcastEpisodeRemoved}
					onClose={handleClose}
				/>
			)}
		</>
	)
}

// the open dialog, the podcast episode page, and the calls after each new image is in place and on close
type PodcastEpisodeImageDialogProps = {
	openDialog: PodcastEpisodeDialog | null
	podcastEpisodePage: PodcastEpisodePageResponse
	onImageChanged: () => void
	onClose: () => void
}

// the image dialog of the podcast episode, which a click on the header image opens, or of its film, which the actions
// menu's Edit film opens
function PodcastEpisodeImageDialog({
	openDialog,
	podcastEpisodePage,
	onImageChanged,
	onClose,
}: PodcastEpisodeImageDialogProps) {
	if (openDialog !== "edit-image" && openDialog !== "edit-film") {
		return null
	}
	const editableImage =
		openDialog === "edit-film"
			? toTopicPodcastEpisodeVideoEditableImage(podcastEpisodePage)
			: toPodcastEpisodeEditableImage(podcastEpisodePage)
	return <EditImageDialog editableImage={editableImage} onImageChanged={onImageChanged} onClose={onClose} />
}

// the dialog the actions menu opened, the podcast episode page, and the calls after a save and on close
type PodcastEpisodeHomeRankDialogProps = {
	openDialog: PodcastEpisodeDialog | null
	podcastEpisodePage: PodcastEpisodePageResponse
	onRanked: () => void
	onClose: () => void
}

// the rank dialog for the home podcasts or the home films, once the actions menu opens one. it sends its moves one
// at a time and then reloads the page. a rejection leaves the dialog open
function PodcastEpisodeHomeRankDialog({
	openDialog,
	podcastEpisodePage,
	onRanked,
	onClose,
}: PodcastEpisodeHomeRankDialogProps) {
	// the list and its write for the chosen dialog, which an admin's page holds
	const isFilm = openDialog === "rank-films"
	const homeItems = isFilm ? podcastEpisodePage.homeTopicPodcastEpisodeVideos : podcastEpisodePage.homePodcastEpisodes
	const homeOrder = isFilm ? podcastEpisodePage.topicPodcastEpisodeVideoHomeOrder : podcastEpisodePage.homeOrder
	const sendHomeOrder = isFilm ? sendTopicPodcastEpisodeVideoHomeOrder : sendPodcastEpisodeHomeOrder
	if ((openDialog !== "rank" && !isFilm) || !homeItems) {
		return null
	}

	// send each move, then reload the page
	const handleSave = async (pinnedOrderMoves: PinnedOrderMove[]): Promise<void> => {
		try {
			await sendPinnedOrderMoves(pinnedOrderMoves, sendHomeOrder)
		} catch (error) {
			console.error("podcast episode home order failed", error)
			toast.error(SAVE_FAILED_TEXT)
			throw error
		}
		onRanked()
	}
	const { podcastEpisode } = podcastEpisodePage
	return (
		<RankDialog
			labels={toHomeRankDialogLabels(isFilm ? "films" : "podcasts")}
			pageItem={{ id: podcastEpisode.id, label: toPodcastEpisodeTitleLabel(podcastEpisode) }}
			pinnedItems={homeItems.map((homeItem) => ({ id: homeItem.id, label: toHomePodcastEpisodeLabel(homeItem) }))}
			isPageItemPinned={homeOrder != null}
			onSave={handleSave}
			onClose={onClose}
		/>
	)
}

// the open dialog, the podcast episode it offers a place, and the close
type PodcastEpisodeProfileRankDialogProps = {
	openDialog: PodcastEpisodeDialog | null
	podcastEpisode: PodcastEpisode
	onClose: () => void
}

// the owner's profile pins for the films or the podcast episodes, once the actions menu opens one
function PodcastEpisodeProfileRankDialog({
	openDialog,
	podcastEpisode,
	onClose,
}: PodcastEpisodeProfileRankDialogProps) {
	if (openDialog !== "rank-profile" && openDialog !== "rank-profile-films") {
		return null
	}
	return (
		<ProfileRankDialog
			rankedNoun={openDialog === "rank-profile-films" ? "films" : "podcasts"}
			pageItem={{ id: podcastEpisode.id, label: toPodcastEpisodeTitleLabel(podcastEpisode) }}
			onClose={onClose}
		/>
	)
}
