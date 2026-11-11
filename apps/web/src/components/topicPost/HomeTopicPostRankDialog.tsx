import { fetchHomeTopicPosts, sendTopicPostHomeOrder } from "@carlnotes/client/topicPostClient"
import type { HomeTopicPostsResponse, TopicPostCard } from "@carlnotes/contracts/topicPosts"
import { type PinnedOrderMove, toHomeRankDialogLabels, toTopicPostRankedItem } from "@carlnotes/core/lib/rankDialog"
import { REQUEST_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { RankDialog } from "@/components/common/RankDialog"
import { sendPinnedOrderMoves } from "@/lib/pinnedOrderMoves"

// the page's own post, if a Topic Post's page opened the dialog, and what a save and a close do
type HomeTopicPostRankDialogProps = {
	pageTopicPost?: Pick<TopicPostCard, "id" | "title" | "topicName">
	onSaved?: () => void
	onClose: () => void
}

/**
 * The admin's list of the home's pinned Topic Posts, opened from the home page or from a Topic Post's page: the
 * pinned posts in their order, the page's post offered a place among them, and the picker that adds one of the newest
 * published posts of public topics.
 */
export function HomeTopicPostRankDialog({ pageTopicPost, onSaved, onClose }: HomeTopicPostRankDialogProps) {
	const [homeTopicPosts, setHomeTopicPosts] = useState<HomeTopicPostsResponse | null>(null)

	// the close the load reads, which a new render replaces without reloading the posts
	const onCloseRef = useRef(onClose)
	onCloseRef.current = onClose

	// read the pinned posts and the ones a pin may name once. a failed read closes the dialog
	useEffect(() => {
		let isCurrent = true
		fetchHomeTopicPosts()
			.then((loadedHomeTopicPosts) => isCurrent && setHomeTopicPosts(loadedHomeTopicPosts))
			.catch(() => {
				if (isCurrent) {
					toast.error(REQUEST_FAILED_TEXT)
					onCloseRef.current()
				}
			})
		return () => {
			isCurrent = false
		}
	}, [])
	if (!homeTopicPosts) {
		return null
	}

	// send the moves one at a time, in order, then tell the page. a rejected move keeps the dialog open
	const handleSave = async (pinnedOrderMoves: PinnedOrderMove[]): Promise<void> => {
		try {
			await sendPinnedOrderMoves(pinnedOrderMoves, sendTopicPostHomeOrder)
		} catch (error) {
			toast.error(REQUEST_FAILED_TEXT)
			throw error
		} finally {
			onSaved?.()
		}
	}

	// the page's post joins the order at the end unless it is pinned already
	const isPageTopicPostPinned = homeTopicPosts.pinnedTopicPosts.some(
		(pinnedTopicPost) => pinnedTopicPost.id === pageTopicPost?.id,
	)
	return (
		<RankDialog
			labels={toHomeRankDialogLabels("posts")}
			pinnedItems={homeTopicPosts.pinnedTopicPosts.map(toTopicPostRankedItem)}
			candidateItems={homeTopicPosts.candidateTopicPosts.map(toTopicPostRankedItem)}
			pageItem={pageTopicPost && toTopicPostRankedItem(pageTopicPost)}
			isPageItemPinned={isPageTopicPostPinned}
			onSave={handleSave}
			onClose={onClose}
		/>
	)
}
