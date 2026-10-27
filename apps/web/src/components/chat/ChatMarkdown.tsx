import { isSafeHref, NEW_TOPIC_CHAT_HREF, toNewTopicChatLinkedMarkdown } from "@carlnotes/core/lib/safeChatMarkdown"

export { isSafeHref, toNewTopicChatLinkedMarkdown } from "@carlnotes/core/lib/safeChatMarkdown"

import type * as React from "react"
import { defaultRehypePlugins, Streamdown } from "streamdown"
import { AnchorLink } from "@/components/common/AnchorLink"
import { openNewTopicChat } from "@/stores/chatPanelStore"

// streamdown's raw plugin is left out, so HTML inside a reply is rendered as characters instead of becoming a live tag
const SAFE_REHYPE_PLUGINS = [defaultRehypePlugins.sanitize, defaultRehypePlugins.harden].filter(
	(plugin) => plugin !== undefined,
)

/**
 * Renders model-written Markdown, completing half-open blocks so a fence never flashes as backticks
 */
export function ChatMarkdown({ markdown, className }: { markdown: string; className?: string }) {
	return (
		<Streamdown
			className={className ?? "space-y-1.5 text-sm leading-relaxed"}
			components={MARKDOWN_COMPONENTS}
			rehypePlugins={SAFE_REHYPE_PLUGINS}
		>
			{toNewTopicChatLinkedMarkdown(markdown)}
		</Streamdown>
	)
}

// a web-scheme link renders through the shared link component
function ReplyLink({ href, children }: { href?: string; children?: React.ReactNode }) {
	// open the new-topic chat from the words that name it
	if (href === NEW_TOPIC_CHAT_HREF) {
		return (
			<button type="button" onClick={() => openNewTopicChat()} className="sentence-link">
				{children}
			</button>
		)
	}
	if (!isSafeHref(href)) {
		return <span>{children}</span>
	}
	return (
		<AnchorLink href={href} className="sentence-link">
			{children}
		</AnchorLink>
	)
}

// an image renders as a link to itself
function ReplyImage({ src, alt }: { src?: string; alt?: string }) {
	if (!isSafeHref(src)) {
		return <span>{alt ?? ""}</span>
	}
	return (
		<AnchorLink href={src} className="sentence-link">
			{alt || "image"}
		</AnchorLink>
	)
}

// only the security-bearing elements are overridden. formatting keeps Streamdown's own styling
const MARKDOWN_COMPONENTS = {
	a: ReplyLink,
	img: ReplyImage,
} as const
