import { isCarlMessage } from "@shared/chatMentions"
import { CarlAvatar } from "@/components/branding/CarlAvatar"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { cn } from "@/lib/utils"

/**
 * The author line every chat message includes, in the private chat and the team room alike.
 * The avatar and display name above the bubble, on every message. A member's line links to their profile page.
 * Carl and a deleted member have no page, so their lines stay plain.
 */
export function ChatAuthor({
	authorUserId,
	authorUsername,
	avatarSource,
	isOwnMessage,
	children,
}: {
	// Carl is null. A deleted member is also null. Their account reference is gone while their recorded name stays
	authorUserId: string | null
	authorUsername: string
	avatarSource?: string | null
	// whether the user wrote this one
	isOwnMessage?: boolean
	children: React.ReactNode
}) {
	// carl's avatar is the racoon. everyone else renders through UserAvatar
	const avatar = isCarlMessage({ authorUserId, authorUsername }) ? (
		<CarlAvatar />
	) : (
		<UserAvatar
			userId={authorUserId ?? ""}
			username={authorUsername}
			avatarSource={avatarSource ?? null}
			className="size-6"
		/>
	)

	// the avatar and name on their own line, linked to the profile if there is a user id.
	const authorRowClass = cn("mb-1 flex items-center gap-2", isOwnMessage && "flex-row-reverse")
	return (
		<div className={cn("flex min-w-0 flex-col", isOwnMessage && "items-end")}>
			{/* a member's entire line is the link, so the avatar and the name both open the profile.
			    carl and a closed account share the missing reference, and neither has a page to open */}
			{authorUserId === null ? (
				<div className={authorRowClass}>
					{avatar}
					<span className="text-muted-foreground text-xs">{authorUsername}</span>
				</div>
			) : (
				<AnchorLink href={`/profiles/${authorUserId}`} className={authorRowClass}>
					{avatar}
					<span className="text-muted-foreground text-xs hover:underline">{authorUsername}</span>
				</AnchorLink>
			)}
			{children}
		</div>
	)
}
