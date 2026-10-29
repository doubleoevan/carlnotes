import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { Text as NativeText, View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { Badge } from "@/components/primitives/badge"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { ShareTopic } from "@/components/share/ShareTopic"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { TopicInfoButton } from "./TopicInfo"

/**
 * Matches the web Topic heading, attribution, unread count, share action, and tags.
 */
export function Topic({ topic }: { topic: TopicDetails }) {
	// match the web's leading-tight title and extend its touch area without adding padding
	const titleStyle = toTypeRoleStyle("sectionHeading")
	const titleLineHeight = Number(titleStyle.fontSize) * 1.25
	return (
		<View className="mx-4 pt-1.5 pb-1.5">
			{/* the title is a link, separate from the count and actions below */}
			<View className="flex-row items-center gap-2">
				<AnchorLink
					href={{ pathname: "/topics/[topicId]", params: { topicId: topic.id } }}
					accessibilityLabel={`Open ${topic.name}`}
					hitSlop={toTouchTargetHitSlop(titleLineHeight + 8)}
					className="min-w-0 shrink justify-center py-1 pl-4 active:opacity-75"
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
				{topic.latestPodcastEpisode ? <PodcastEpisodePlayButton episode={topic.latestPodcastEpisode} /> : null}
				<TopicInfoButton topic={topic} />
			</View>
			{/* the attribution and plain unread count share the next line */}
			<View className="flex-row items-center justify-between gap-3">
				<TopicByline topic={topic} />
				<View className="ml-auto min-h-11 shrink-0 flex-row items-center gap-1">
					{topic.newCount > 0 ? (
						<NativeText style={toTypeRoleStyle("label")} className="text-badge">
							{topic.newCount} new
						</NativeText>
					) : null}
					<ShareTopic topic={topic} />
				</View>
			</View>
			{/* tags keep the web's secondary badge treatment and inset */}
			{topic.tags.length > 0 ? (
				<View className="my-1.5 flex-row flex-wrap gap-1 pl-3">
					{topic.tags.map((tag) => (
						<Badge key={tag} variant="secondary">
							<Text>{tag}</Text>
						</Badge>
					))}
				</View>
			) : null}
		</View>
	)
}

/**
 * Links the delivered byline team or, when absent, the Topic owner.
 */
export function TopicByline({
	topic,
	isPage = false,
}: {
	topic: Pick<TopicDetails, "teamLink" | "owner">
	isPage?: boolean
}) {
	// prefer the team only when the API supplies its visible byline
	const team = topic.teamLink
	const owner = topic.owner
	if (!team && !owner) {
		return null
	}

	// use the same identity routes and avatar versions as the web
	const name = team?.name ?? owner?.username ?? ""
	const ownerId = team?.teamId ?? owner?.userId ?? ""
	const path = team ? `/teams/${team.teamId}` : `/profiles/${ownerId}`
	let imageUrl: string | null = null
	if (team?.avatarVersion) {
		imageUrl = `/api/team-avatars/${team.teamId}?v=${team.avatarVersion}`
	} else if (!team && owner?.avatarVersion) {
		imageUrl = toAvatarImagePath(owner.userId, owner.avatarVersion)
	}
	return (
		<AnchorLink
			href={`${SITE_URL}${path}`}
			accessibilityLabel={`Brewed by ${name}`}
			hitSlop={toTouchTargetHitSlop(44)}
			className={
				isPage
					? "min-h-11 min-w-0 flex-row items-center gap-2 active:opacity-75"
					: "min-h-11 min-w-0 shrink flex-row items-center gap-2 pl-4 active:opacity-75"
			}
		>
			<Avatar imageUrl={imageUrl} ownerId={ownerId} name={name} />
			<NativeText style={toTypeRoleStyle(isPage ? "body" : "caption")} className="shrink text-muted-foreground">
				Brewed by <NativeText className="text-link">{name}</NativeText>
			</NativeText>
		</AnchorLink>
	)
}
