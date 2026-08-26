import type * as React from "react"
import { Link } from "react-router-dom"

// the schemes that open in the same tab with no target or rel, like a mail client or dialer
const SCHEME_PREFIXES = ["mailto:", "tel:", "sms:"]

// the paths the server renders itself: the docs site and the blog. the client router has no routes for them
const SERVER_RENDERED_PREFIXES = ["/docs", "/blog"]

/**
 * The component that every link in feature code goes through
 * the href decides how it renders
 */
export function AnchorLink({ href, children, ...props }: React.ComponentProps<"a"> & { href: string }) {
	// a scheme link hands off to another app, so it gets no target and no rel
	if (SCHEME_PREFIXES.some((prefix) => href.startsWith(prefix))) {
		return (
			<a href={href} {...props}>
				{children}
			</a>
		)
	}

	// a server-rendered path exits the SPA, so it navigates as a traditional anchor with a full page load
	const path = href.split(/[?#]/, 1)[0] ?? href
	if (SERVER_RENDERED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
		return (
			<a href={href} {...props}>
				{children}
			</a>
		)
	}

	// an internal route navigates client-side so the app never does a full reload
	if (href.startsWith("/")) {
		return (
			<Link to={href} {...props}>
				{children}
			</Link>
		)
	}

	// everything else is external. noopener denies the opened page a way back to this one
	return (
		<a href={href} target="_blank" rel="noopener noreferrer" {...props}>
			{children}
		</a>
	)
}
