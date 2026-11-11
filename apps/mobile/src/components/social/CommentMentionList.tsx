import {
	type CommentMentionListElements,
	CommentMentionList as SharedCommentMentionList,
} from "@carlnotes/core/components/CommentMentionList"
import type { ComponentProps } from "react"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

/**
 * The app's elements of the mentions list, the web's rows at phone width: each row a link to its Comment, the
 * author's name bold before the Comment's first line, over the page it sits on.
 */
export const COMMENT_MENTION_LIST_ELEMENTS: CommentMentionListElements = {
	List: ({ children }) => <View>{children}</View>,
	Row: ({ commentMention, authorName, onChoose }) => (
		<AnchorLink
			href={commentMention.path}
			accessibilityLabel={`${authorName} mentioned you on ${commentMention.page.name}: ${commentMention.text}`}
			onPress={onChoose}
			className="min-h-12 justify-center rounded-md px-2 py-2 active:bg-accent"
		>
			<Text numberOfLines={2} className="text-sm">
				<Text className="text-sm font-semibold">{authorName}</Text> {commentMention.text}
			</Text>
			<Text numberOfLines={1} className="text-xs text-muted-foreground">
				{commentMention.page.name}
			</Text>
		</AnchorLink>
	),
	Empty: ({ children }) => <Text className="px-2 py-2 text-sm text-muted-foreground">{children}</Text>,
	MarkAllSeen: ({ label, onPress }) => (
		<Button variant="ghost" accessibilityLabel={label} onPress={onPress} className="mt-1">
			<Text>{label}</Text>
		</Button>
	),
}

/**
 * The user's unseen Comment Mentions in the app, each row opening its Comment on its screen.
 */
export function CommentMentionList(props: Omit<ComponentProps<typeof SharedCommentMentionList>, "elements">) {
	return <SharedCommentMentionList {...props} elements={COMMENT_MENTION_LIST_ELEMENTS} />
}
