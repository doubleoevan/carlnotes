import { toTopicPath } from "@carlnotes/contracts/seo"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import { Text as NativeText, View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { Badge } from "@/components/primitives/badge"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { ShareTopic } from "@/components/share/ShareTopic"
import { LIST_TOPIC_IMAGE_CLASS } from "@/topicImageClasses"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { TopicByline } from "./TopicByline"
import { TopicImageLink } from "./TopicImageLink"
import { TopicInfoButton } from "./TopicInfo"

/**
 * Matches the web Topic heading, attribution, unread count, share action, and tags.
 */
export function Topic({ topic }: { topic: TopicDetails }) {
	// match the web's leading-tight title and extend its touch area without adding padding
	const titleStyle = toTypeRoleStyle("sectionHeading")
	const titleLineHeight = Number(titleStyle.fontSize) * 1.25
	return (
		<View className="mx-4 my-4">
			{/* the image at the left edge of the findings card, which opens the topic's screen as the title does, with
			    the title, the tags, and the byline beside it */}
			<View className="flex-row items-start gap-4">
				<TopicImageLink
					image={topic.image}
					size="page"
					name={topic.name}
					className={LIST_TOPIC_IMAGE_CLASS}
					path={toTopicPath(topic)}
				/>
				<View className="min-w-0 flex-1">
					<View className="flex-row flex-wrap items-center gap-x-2">
						<AnchorLink
							href={{ pathname: "/topics/[topicId]", params: { topicId: topic.id } }}
							accessibilityLabel={`Open ${topic.name}`}
							hitSlop={toTouchTargetHitSlop(titleLineHeight + 8)}
							className="min-w-0 shrink justify-center pb-1 active:opacity-75"
						>
							<NativeText
								accessibilityRole="header"
								style={[titleStyle, { lineHeight: titleLineHeight }]}
								className="text-link"
							>
								{topic.name}
							</NativeText>
						</AnchorLink>
						<PageUpdateCountBadge topicId={topic.id} />
						{topic.latestPodcastEpisode ? (
							<PodcastEpisodePlayButton podcastEpisode={topic.latestPodcastEpisode} />
						) : null}
						<TopicInfoButton topic={topic} />
					</View>
					{/* the tags, then the byline, with the unread count and the share action at the right of its row, over
					    the findings card's top right corner. React Native has no float, so they stay beside the image */}
					{topic.tags.length > 0 ? (
						<View className="mt-1.5 flex-row flex-wrap gap-1">
							{topic.tags.map((tag) => (
								<Badge key={tag} variant="secondary">
									<Text>{tag}</Text>
								</Badge>
							))}
						</View>
					) : null}
					<View className="mt-1.5 flex-row items-end justify-between gap-3">
						<TopicByline topic={topic} />
						<TopicRowActions topic={topic} />
					</View>
				</View>
			</View>
		</View>
	)
}

// the plain unread count and the share action, at the right of a Topics row. the touch box reaches into the gaps
// around its row
function TopicRowActions({ topic }: { topic: TopicDetails }) {
	return (
		<View className="-my-2.5 min-h-11 shrink-0 flex-row items-center">
			{topic.newCount > 0 ? (
				<NativeText style={toTypeRoleStyle("label")} className="pr-1 text-badge">
					{topic.newCount} new
				</NativeText>
			) : null}
			<ShareTopic topic={topic} />
		</View>
	)
}
