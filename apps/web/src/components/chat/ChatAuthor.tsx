import { isModelChatMessage } from "@carlnotes/contracts/chatMentions"
import type { PodcastEpisodeSpeaker } from "@carlnotes/contracts/enums"
import { cn } from "@carlnotes/nightshift/classNames"
import { HostAvatar } from "@/components/branding/HostAvatar"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"

/**
 * The author line every chat message includes, in the private chat and the team chat room alike.
 * The avatar and display name above the bubble, on every chat message. A member's line links to their profile page.
 * Carl and a deleted member have no page, so their lines stay plain.
 */
export function ChatAuthor({
	authorUserId,
	authorUsername,
	avatarVersion,
	isOwnChatMessage,
	speaker,
	children,
}: {
	// Carl is null. A deleted member is also null. Their account reference is gone while their recorded name stays
	authorUserId: string | null
	authorUsername: string
	avatarVersion?: string | null
	// whether the user wrote this one
	isOwnChatMessage?: boolean
	// the speaker who gave a private chat reply, which vienna gives only to a question asked from the podcast player
	speaker?: PodcastEpisodeSpeaker
	children: React.ReactNode
}) {
	// the host who gave the reply, carl on any message of his without a speaker. the hosts' avatars are their own
	// pictures, and everyone else renders through UserAvatar
	const hostSpeaker = speaker ?? (isModelChatMessage({ authorUserId, authorUsername }) ? "host" : undefined)
	const avatar = hostSpeaker ? (
		<HostAvatar speaker={hostSpeaker} />
	) : (
		<UserAvatar
			userId={authorUserId ?? ""}
			username={authorUsername}
			avatarVersion={avatarVersion ?? null}
			className="size-6"
		/>
	)

	// the avatar and name on their own line, linked to the profile if there is a user id.
	const authorRowClass = cn("mb-1 flex items-center gap-2", isOwnChatMessage && "flex-row-reverse")
	return (
		<div className={cn("flex min-w-0 flex-col", isOwnChatMessage && "items-end")}>
			{/* a member's entire line is the link, so the avatar and the name both open the profile.
			    the hosts and a closed account share the missing reference, and none has a page to open */}
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
