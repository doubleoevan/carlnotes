import { toCtaTag } from "@carlnotes/contracts/signupCta"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { defaultParseSearch, Link } from "@tanstack/react-router"
import type * as React from "react"
import { createContext, useContext } from "react"
import { isPathAtOrAfter } from "@/lib/utils"
import { captureVisitEvent } from "@/lib/visitAnalytics"

// the uri schemes that open another app in the same tab with no target or rel, like a mail client or a podcast app
const URI_SCHEME_PREFIXES = ["mailto:", "tel:", "sms:", "cursor:", "vscode:", "podcast:", "pcast:"]

// the paths the server answers itself, which the client router has no routes for: the docs site, the blog, the
// releases, the Nightshift component browser, and the api's own files, which download, or open in a new tab with
// isNewTab
const SERVER_PATH_PREFIXES = ["/docs", "/blog", "/releases", "/nightshift", "/api"]

// the target and rel of a link that opens in a new tab. noopener denies the opened page a way back to this one
const NEW_TAB_PROPS = { target: "_blank", rel: "noopener noreferrer" }

/**
 * Opens a link's absolute url somewhere other than this page, such as the host around an mcp card. A link under a
 * provider of it opens through it.
 */
export const LinkOpenerContext = createContext<((url: string) => void) | null>(null)

/**
 * The component that every link in feature code goes through
 * the href decides how it renders
 */
export function AnchorLink({
	href,
	isUserContent,
	isNewTab,
	replace,
	resetScroll,
	children,
	...props
}: React.ComponentProps<"a"> & {
	href: string
	isUserContent?: boolean
	// opens a server path or an internal route in a new tab. an external link always opens in one
	isNewTab?: boolean
	replace?: boolean
	resetScroll?: boolean
}) {
	// a link under a link opener opens its absolute url through it, such as in the host around an mcp card, whose
	// document's base url is the site that served it. only a web url opens, and any other scheme renders its text
	const openLink = useContext(LinkOpenerContext)
	if (openLink) {
		const absoluteUrl = new URL(href, globalThis.document?.baseURI ?? SITE_URL).toString()
		if (!absoluteUrl.startsWith("https://") && !absoluteUrl.startsWith("http://")) {
			return <a {...props}>{children}</a>
		}
		const handleOpenerClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
			props.onClick?.(event)
			event.preventDefault()
			openLink(absoluteUrl)
		}
		return (
			<a href={absoluteUrl} {...props} onClick={handleOpenerClick}>
				{children}
			</a>
		)
	}

	// a uri scheme link opens another app, so it gets no target and no rel
	if (URI_SCHEME_PREFIXES.some((prefix) => href.startsWith(prefix))) {
		return (
			<a href={href} {...props}>
				{children}
			</a>
		)
	}

	// a server path does not use the router, so the link is a plain anchor with a full page load, in a new tab with
	// isNewTab
	const path = href.split(/[?#]/, 1)[0] ?? href
	const newTabProps = isNewTab ? NEW_TAB_PROPS : {}
	if (SERVER_PATH_PREFIXES.some((prefix) => isPathAtOrAfter(path, prefix))) {
		return (
			<a href={href} {...newTabProps} {...props}>
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
				replace={replace}
				resetScroll={resetScroll}
				{...newTabProps}
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
