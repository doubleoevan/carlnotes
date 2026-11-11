import {
	type CommentMentionListElements,
	CommentMentionList as SharedCommentMentionList,
} from "@carlnotes/core/components/CommentMentionList"
import { cn } from "@carlnotes/nightshift/classNames"
import type { ComponentProps } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { MENU_OPTION_CLASS } from "@/lib/styleClasses"

/**
 * The web's elements of the mentions list: each row a link to its Comment, the author's name bold before the
 * Comment's first line, over the page it sits on.
 */
export const COMMENT_MENTION_LIST_ELEMENTS: CommentMentionListElements = {
	List: ({ children }) => <ul>{children}</ul>,
	Row: ({ commentMention, authorName, onChoose }) => (
		<li>
			<AnchorLink
				href={commentMention.path}
				onClick={onChoose}
				className={cn(MENU_OPTION_CLASS, "block h-auto py-2 sm:min-h-0")}
			>
				<span className="line-clamp-2">
					<span className="font-semibold">{authorName}</span> {commentMention.text}
				</span>
				<span className="text-muted-foreground block truncate text-xs">{commentMention.page.name}</span>
			</AnchorLink>
		</li>
	),
	Empty: ({ children }) => <p className="text-muted-foreground px-2 py-2 text-sm">{children}</p>,
	MarkAllSeen: ({ label, onPress }) => (
		<Button variant="ghost" size="sm" onClick={onPress} className="mt-1 w-full">
			{label}
		</Button>
	),
}

/**
 * The user's unseen Comment Mentions on the web, each row opening its Comment on its page.
 */
export function CommentMentionList(props: Omit<ComponentProps<typeof SharedCommentMentionList>, "elements">) {
	return <SharedCommentMentionList {...props} elements={COMMENT_MENTION_LIST_ELEMENTS} />
}
