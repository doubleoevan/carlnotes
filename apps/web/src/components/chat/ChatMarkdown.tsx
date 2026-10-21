import type * as React from "react"
import { defaultRehypePlugins, Streamdown } from "streamdown"
import { AnchorLink } from "@/components/common/AnchorLink"
import { openNewTopicChat } from "@/stores/chatPanelStore"

// the words that name the new-topic chat, which carl writes when he points a user at it, and the href they get
// once they are linked. a url fragment, which streamdown's harden plugin passes through and no page reads
const NEW_TOPIC_CHAT_WORDS = "Give Carl a topic. You know the one."
const NEW_TOPIC_CHAT_HREF = "#new-topic-chat"

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

/**
 * The Markdown with the words that name the new-topic chat turned into a link to that chat.
 */
export function toNewTopicChatLinkedMarkdown(markdown: string): string {
	return markdown.replaceAll(NEW_TOPIC_CHAT_WORDS, `[${NEW_TOPIC_CHAT_WORDS}](${NEW_TOPIC_CHAT_HREF})`)
}

/**
 * Whether a model-written href may render as a live link: web schemes only, never javascript: or data:.
 */
export function isSafeHref(href: string | undefined): href is string {
	return typeof href === "string" && (href.startsWith("https://") || href.startsWith("http://"))
}

// a web-scheme link renders through the shared link component
function ReplyLink({ href, children }: { href?: string; children?: React.ReactNode }) {
	// open the new-topic chat from the words that name it
	if (href === NEW_TOPIC_CHAT_HREF) {
		return (
			<button type="button" onClick={() => openNewTopicChat()} className="text-link hover:underline">
				{children}
			</button>
		)
	}
	if (!isSafeHref(href)) {
		return <span>{children}</span>
	}
	return (
		<AnchorLink href={href} className="text-link hover:underline">
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
		<AnchorLink href={src} className="text-link hover:underline">
			{alt || "image"}
		</AnchorLink>
	)
}

// only the security-bearing elements are overridden. formatting keeps Streamdown's own styling
const MARKDOWN_COMPONENTS = {
	a: ReplyLink,
	img: ReplyImage,
} as const
