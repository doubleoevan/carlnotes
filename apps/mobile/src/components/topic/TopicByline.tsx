// a topic's byline: the team or the owner of the topic, with its avatar
import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import { toProfilePath } from "@carlnotes/contracts/seo"
import { SITE_URL } from "@carlnotes/contracts/site"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import { cn } from "@carlnotes/nightshift/classNames"
import { Text as NativeText } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * Links the delivered byline team or, when absent, the Topic owner.
 */
export function TopicByline({
	topic,
	label = "Brewed by",
	isPage = false,
	isInset = true,
}: {
	topic: Pick<TopicDetails, "teamLink" | "owner">
	label?: string
	isPage?: boolean
	// whether a card's byline keeps its left inset, which a row that starts at the edge drops
	isInset?: boolean
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
	const path = team ? `/teams/${team.teamId}` : toProfilePath(ownerId)
	let imageUrl: string | null = null
	if (team?.avatarVersion) {
		imageUrl = `/api/team-avatars/${team.teamId}?v=${team.avatarVersion}`
	} else if (!team && owner?.avatarVersion) {
		imageUrl = toAvatarImagePath(owner.userId, owner.avatarVersion)
	}
	return (
		<AnchorLink
			href={`${SITE_URL}${path}`}
			accessibilityLabel={`${label} ${name}`}
			hitSlop={toTouchTargetHitSlop(44)}
			className={cn(
				"min-h-11 min-w-0 flex-row items-center gap-2 active:opacity-75",
				!isPage && "shrink",
				!isPage && isInset && "pl-4",
			)}
		>
			<Avatar imageUrl={imageUrl} ownerId={ownerId} name={name} />
			<NativeText style={toTypeRoleStyle(isPage ? "body" : "caption")} className="shrink text-muted-foreground">
				{label} <NativeText className="text-link">{name}</NativeText>
			</NativeText>
		</AnchorLink>
	)
}
