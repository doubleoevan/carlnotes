// the podcast episode page's header: the Subscribe button beside the new topic button, then the episode's own image
// beside its title, description, and byline
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { EDIT_IMAGE_DIALOG_TITLES } from "@carlnotes/core/lib/topicImageEditor"
import { usePageCommentMentions } from "@carlnotes/core/stores/commentMentionStore"
import { Rss } from "lucide-react-native"
import type { ComponentRef, RefObject } from "react"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { CommentMentionBadge } from "@/components/social/CommentMentionBadge"
import { ReactionRow } from "@/components/social/ReactionRow"
import { TopicByline } from "@/components/topic/TopicByline"
import { NewTopicButton } from "@/components/topic/TopicHomeActions"
import { TopicHeaderImage } from "@/components/topic/TopicImageButton"
import {
	PAGE_BUTTON_ROW_CLASS,
	PLAIN_PAGE_BUTTON_CLASS,
	PLAIN_PAGE_BUTTON_ICON_CLASS,
	PLAIN_PAGE_BUTTON_TEXT_CLASS,
} from "@/pageButtonClasses"

/**
 * Draws the podcast episode screen's header. The text stays beside the image, as React Native has no float for it to
 * run under.
 */
export function PodcastEpisodeHeader({
	page: { podcastEpisode, topic, reactions, canEditPodcastEpisode },
	isSignedIn,
	feedButtonRef,
	onSubscribe,
	onEditImage,
}: {
	page: PodcastEpisodePageResponse
	isSignedIn: boolean
	// the Subscribe button, which the feed dialog returns focus to, and what opens the dialog
	feedButtonRef: RefObject<ComponentRef<typeof View> | null>
	onSubscribe: () => void
	// the press on an editor's image, which opens the image sheet
	onEditImage: () => void
}) {
	return (
		<View className="-mt-1">
			{/* the Subscribe button on the left and the new topic button on the right. the negative margin leaves 16
			    points above the row, under the search bar's margin and the screen's top padding, as the header's margin
			    leaves below it */}
			<View className={PAGE_BUTTON_ROW_CLASS}>
				<Button
					ref={feedButtonRef}
					variant="outline"
					className={PLAIN_PAGE_BUTTON_CLASS}
					accessibilityLabel="Subscribe"
					onPress={onSubscribe}
				>
					{/* the icon alone takes the highlight color, and the button stays plain */}
					<Icon as={Rss} className={PLAIN_PAGE_BUTTON_ICON_CLASS} />
					<Text className={PLAIN_PAGE_BUTTON_TEXT_CLASS}>Subscribe</Text>
				</Button>
				<NewTopicButton />
			</View>
			{/* the podcast episode's own image beside the title, the description, and the byline. React Native has no
			    float, so the text stays beside the image instead of running under it as on the web */}
			<View className="mt-4 flex-row items-start gap-4">
				<TopicHeaderImage
					image={podcastEpisode.image}
					name={podcastEpisode.title ?? topic.name}
					editLabel={EDIT_IMAGE_DIALOG_TITLES.podcastEpisode}
					onEdit={canEditPodcastEpisode ? onEditImage : undefined}
				/>
				<View className="min-w-0 flex-1">
					{/* the title, with the count of the unseen mentions in the podcast episode's thread right after it */}
					<View className="min-w-0 flex-row items-start gap-2">
						<Text accessibilityRole="header" className="min-w-0 flex-1 font-display text-2xl leading-tight">
							{podcastEpisode.title}
						</Text>
						<PodcastEpisodeMentionBadge podcastEpisodeId={podcastEpisode.id} />
					</View>
					{podcastEpisode.description && <Text className="mt-1.5 text-sm">{podcastEpisode.description}</Text>}
					{/* the byline, the topic's name, and the podcast episode's reactions on one line */}
					<View className="mt-1.5 flex-row flex-wrap items-center gap-x-3">
						<View className="min-w-0 shrink flex-row flex-wrap items-center gap-x-1">
							<TopicByline topic={topic} label="Recorded by" isPage />
							<Text className="text-sm text-muted-foreground">
								{topic.teamLink || topic.owner ? "for " : "Coffee Break podcast for "}
								<AnchorLink asChild href={toTopicPath(topic)} accessibilityLabel={`Open ${topic.name}`}>
									<Text className="text-sm text-link">{topic.name}</Text>
								</AnchorLink>
							</Text>
						</View>
						<ReactionRow
							target={{ kind: "podcastEpisode", id: podcastEpisode.id }}
							summary={reactions}
							isSignedIn={isSignedIn}
						/>
					</View>
				</View>
			</View>
		</View>
	)
}

// the unseen Comment Mentions in the podcast episode's own thread, as a count whose press opens the mentions list
function PodcastEpisodeMentionBadge({ podcastEpisodeId }: { podcastEpisodeId: string }) {
	const commentMentions = usePageCommentMentions({ kind: "podcastEpisode", id: podcastEpisodeId })
	return <CommentMentionBadge commentMentions={commentMentions} place="title" />
}
