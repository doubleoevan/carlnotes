import {
	type ChatAuthorElements,
	type ChatAuthorProps,
	ChatAuthor as SharedChatAuthor,
} from "@carlnotes/core/components/ChatAuthor"
import { cn } from "@carlnotes/nightshift/classNames"
import { HostAvatar } from "@/components/branding/HostAvatar"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"

/**
 * Adapts shared author composition to browser links and avatars.
 */
export function ChatAuthor(props: ChatAuthorProps) {
	return <SharedChatAuthor {...props} elements={chatAuthorElements} />
}

// the browser author elements
const chatAuthorElements: ChatAuthorElements = {
	HostAvatar,
	UserAvatar,
	Frame: ({ children, isOwn }) => <div className={cn("flex min-w-0 flex-col", isOwn && "items-end")}>{children}</div>,
	Row: ({ children, isOwn, userId }) => {
		// render the linked or plain author row
		const className = cn("mb-1 flex items-center gap-2", isOwn && "flex-row-reverse")
		return userId === null ? (
			<div className={className}>{children}</div>
		) : (
			<AnchorLink href={`/profiles/${userId}`} className={className}>
				{children}
			</AnchorLink>
		)
	},
	Name: ({ children, isLinked }) => (
		<span className={cn("text-muted-foreground text-xs", isLinked && "hover:underline")}>{children}</span>
	),
}
