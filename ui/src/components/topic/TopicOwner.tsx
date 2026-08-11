import type { TopicResponse } from "@shared/contracts"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { cn } from "@/lib/utils"

// who owns a topic. the topic info, the topic page, and the home page all show them
type Owner = NonNullable<TopicResponse["owner"]>

/**
 * The owner's credit on a topic: their image and username, linking to their profile.
 */
export function TopicOwner({
	owner,
	avatarClassName = "size-6",
	className,
	isLabelShown = true,
}: {
	owner: Owner
	avatarClassName?: string
	className?: string
	// optionally hide the "Brewed by" label in the "Carl's barista" section
	isLabelShown?: boolean
}) {
	return (
		<AnchorLink
			href={`/profiles/${owner.userId}`}
			className={cn("inline-flex items-center gap-2 hover:underline", className)}
		>
			<UserAvatar
				userId={owner.userId}
				username={owner.username}
				avatarSource={owner.avatarSource}
				className={avatarClassName}
			/>
			{isLabelShown ? (
				<span className="text-muted-foreground">
					Brewed by <span className="text-link">{owner.username}</span>
				</span>
			) : (
				<span className="text-link">{owner.username}</span>
			)}
		</AnchorLink>
	)
}
