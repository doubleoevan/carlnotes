import { toCtaTag } from "@shared/contracts/signupCta"
import { defaultParseSearch, Link } from "@tanstack/react-router"
import type * as React from "react"
import { SITE_URL } from "@/lib/pageHead"
import { captureVisitEvent } from "@/lib/visitAnalytics"

// the uri schemes that open another app in the same tab with no target or rel, like a mail client or a podcast app
const URI_SCHEME_PREFIXES = ["mailto:", "tel:", "sms:", "cursor:", "vscode:", "podcast:", "pcast:"]

// the paths the server answers itself, which the client router has no routes for: the docs site, the blog, the
// releases, and the api's own files, which download or open in a new tab through the props the caller passes
const SERVER_PATH_PREFIXES = ["/docs", "/blog", "/releases", "/api"]

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
	// a uri scheme link opens another app, so it gets no target and no rel
	if (URI_SCHEME_PREFIXES.some((prefix) => href.startsWith(prefix))) {
		return (
			<a href={href} {...props}>
				{children}
			</a>
		)
	}

	// a server path does not use the router, so the link is a plain anchor with a full page load
	const path = href.split(/[?#]/, 1)[0] ?? href
	if (SERVER_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
		return (
			<a href={href} {...props}>
				{children}
			</a>
		)
	}

	// an internal route navigates client-side. the router takes the path, the query, and the hash as separate props.
	// the site url lets the relative href parse, and the query parses as it does on a full page load.
	// a protocol-relative url, two slashes then a host, is another site and not a route
	if (href.startsWith("/") && !href.startsWith("//")) {
		const url = new URL(href, SITE_URL)

		// a link with a cta param reports its cta tag as a visit event
		const ctaTag = toCtaTag(url.searchParams.get("cta"))
		const handleClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
			props.onClick?.(event)
			if (ctaTag) {
				captureVisitEvent("visit_cta_clicked", { cta: ctaTag })
			}
		}
		return (
			<Link
				to={url.pathname}
				search={defaultParseSearch(url.search)}
				hash={url.hash.slice(1)}
				{...props}
				onClick={handleClick}
			>
				{children}
			</Link>
		)
	}

	// everything else is external. noopener denies the opened page a way back to this one.
	// a user content link gets rel ugc (use generated content - not vouched for) for search engines and keeps its referrer.
	// only a web url gets an href. a javascript or data scheme renders its text with nothing to follow
	const isWebUrl = href.startsWith("https://") || href.startsWith("http://") || href.startsWith("//")
	return (
		<a
			href={isWebUrl ? href : undefined}
			target="_blank"
			rel={isUserContent ? "noopener ugc" : "noopener noreferrer"}
			{...props}
		>
			{children}
		</a>
	)
}
