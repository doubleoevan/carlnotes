import type * as React from "react"
import { defaultRehypePlugins, Streamdown } from "streamdown"
import { AnchorLink } from "@/components/common/AnchorLink"

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
			{markdown}
		</Streamdown>
	)
}

/**
 * Whether a model-written href may render as a live link: web schemes only, never javascript: or data:.
 */
export function isSafeHref(href: string | undefined): href is string {
	return typeof href === "string" && (href.startsWith("https://") || href.startsWith("http://"))
}

// a web-scheme link renders through the shared link component. any other scheme renders as plain text,
// so a javascript: or data: href the model wrote can never be clicked
function ReplyLink({ href, children }: { href?: string; children?: React.ReactNode }) {
	if (!isSafeHref(href)) {
		return <span>{children}</span>
	}
	return (
		<AnchorLink href={href} className="text-link hover:underline">
			{children}
		</AnchorLink>
	)
}

// an image renders as a link to itself instead of loading inline
// because an image url the browser fetches on its own can leak data to whoever hosts it
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
