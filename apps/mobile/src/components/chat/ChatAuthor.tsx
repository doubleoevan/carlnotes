import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import {
	type ChatAuthorElements,
	type ChatAuthorProps,
	ChatAuthor as SharedChatAuthor,
} from "@carlnotes/core/components/ChatAuthor"
import { cn } from "@carlnotes/nightshift/classNames"
import { View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { HostAvatar } from "@/components/branding/HostAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Text } from "@/components/primitives/text"

/**
 * Keeps the web's identity and alignment through shared author composition.
 */
export function ChatAuthor(props: ChatAuthorProps) {
	return <SharedChatAuthor {...props} elements={CHAT_AUTHOR_ELEMENTS} />
}

// native elements for the shared chat author
const CHAT_AUTHOR_ELEMENTS: ChatAuthorElements = {
	Frame: ({ children, isOwn }) => <View className={cn("min-w-0", isOwn && "items-end")}>{children}</View>,
	Row: ({ children, isOwn, userId }) => {
		// render the linked or plain author row
		const className = cn("mb-1 flex-row items-center gap-2", isOwn && "flex-row-reverse")
		return userId ? (
			<AnchorLink href={`/profiles/${userId}`} accessibilityLabel="Open author profile" className={className}>
				{children}
			</AnchorLink>
		) : (
			<View className={className}>{children}</View>
		)
	},
	Name: ({ children }) => <Text className="text-xs text-muted-foreground">{children}</Text>,
	UserAvatar: ({ userId, username, avatarVersion }) => (
		<Avatar
			ownerId={userId}
			name={username}
			imageUrl={avatarVersion ? toAvatarImagePath(userId, avatarVersion) : null}
		/>
	),
	HostAvatar,
}
