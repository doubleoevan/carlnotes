import { defaultParseSearch, Link } from "@tanstack/react-router"
import type * as React from "react"
import { SITE_URL } from "@/lib/pageHead"

// the schemes that open in the same tab with no target or rel, like a mail client, dialer, or code editor
const SCHEME_PREFIXES = ["mailto:", "tel:", "sms:", "cursor:", "vscode:"]

// the paths the server renders itself: the docs site, the blog, and the releases. the client router has no routes for them
const SERVER_RENDERED_PREFIXES = ["/docs", "/blog", "/releases"]

/**
 * The component that every link in feature code goes through
 * the href decides how it renders
 */
export function AnchorLink({
	href,
	isUserContent,
	children,
	...props
}: React.ComponentProps<"a"> & { href: string; isUserContent?: boolean }) {
	// a scheme link hands off to another app, so it gets no target and no rel
	if (SCHEME_PREFIXES.some((prefix) => href.startsWith(prefix))) {
		return (
			<a href={href} {...props}>
				{children}
			</a>
		)
	}

	// a server-rendered path does not use the router, so the link is a plain anchor with a full page load
	const path = href.split(/[?#]/, 1)[0] ?? href
	if (SERVER_RENDERED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
		return (
			<a href={href} {...props}>
				{children}
			</a>
		)
	}

	// an internal route navigates client-side. the router takes the path, the query, and the hash as separate props.
	// the site url lets the relative href parse, and the query parses as it does on a full page load
	if (href.startsWith("/")) {
		const url = new URL(href, SITE_URL)
		return (
			<Link to={url.pathname} search={defaultParseSearch(url.search)} hash={url.hash.slice(1)} {...props}>
				{children}
			</Link>
		)
	}

	// everything else is external. noopener denies the opened page a way back to this one.
	// a user content link gets rel ugc (use generated content - not vouched for) for search engines and keeps its referrer
	return (
		<a href={href} target="_blank" rel={isUserContent ? "noopener ugc" : "noopener noreferrer"} {...props}>
			{children}
		</a>
	)
}
