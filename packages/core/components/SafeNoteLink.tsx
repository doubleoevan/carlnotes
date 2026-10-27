import type { ComponentType, ReactNode } from "react"
import { isAllowedNoteUrl } from "../lib/safeNoteMarkdown"

// the Markdown parser's link props and platform text/link elements
export type SafeNoteLinkProps = { children?: ReactNode; href?: string; allowedUrls?: ReadonlySet<string> }
export type SafeNoteLinkComponents = {
	Link: ComponentType<{ href: string; children?: ReactNode }>
	Text: ComponentType<{ children?: ReactNode }>
}

/**
 * Links only stored Finding destinations and renders other destinations as plain text.
 */
export function SafeNoteLink({
	children,
	href,
	allowedUrls,
	components: { Link, Text },
}: SafeNoteLinkProps & { components: SafeNoteLinkComponents }) {
	if (isAllowedNoteUrl(href, allowedUrls)) {
		return <Link href={href}>{children}</Link>
	}
	// keep a bare destination from appearing twice
	const [firstChild] = Array.isArray(children) ? children : [children]
	const label = typeof firstChild === "string" ? firstChild : null
	return (
		<Text>
			{children}
			{href && href !== label ? ` (${href})` : ""}
		</Text>
	)
}
