import { SITE_TITLE } from "@shared/seo"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRootRoute, HeadContent, Outlet, Scripts, useLocation } from "@tanstack/react-router"
import { type ReactNode, useEffect, useState } from "react"
import { SITE_URL } from "@/lib/pageHead"
import { hasSessionCookie } from "@/lib/sessionCookie"
import { captureVisit } from "@/lib/visitAnalytics"
import "@/globals.css"

// the site-wide description, the default for a page with no head of its own
const SITE_DESCRIPTION = "Carl keeps up with your topics and turns what matters into notes worth reading."

// the site-wide share card image, the default for a page with no head of its own
const SITE_IMAGE_URL = `${SITE_URL}/opengraph-image.png`

// the script that sets the theme class before first paint. a theme saved in localStorage wins over the OS setting,
// and the theme-color meta tag follows the resolved theme's hero color
const THEME_SCRIPT = `(() => {
  try {
    const savedTheme = localStorage.getItem("theme")
    const isDark = savedTheme ? savedTheme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches
    document.documentElement.classList.toggle("dark", isDark)
    if (isDark) {
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#0f0c09")
    }
  } catch {}
})()`

// the document every route renders inside, with the head defaults a route's own head replaces
export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content",
			},
			{ name: "theme-color", content: "#3b2a1d" },
			{ title: SITE_TITLE },
			{ name: "description", content: SITE_DESCRIPTION },
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "CarlNotes" },
			{ property: "og:url", content: SITE_URL },
			{ property: "og:title", content: SITE_TITLE },
			{ property: "og:description", content: SITE_DESCRIPTION },
			{ property: "og:image", content: SITE_IMAGE_URL },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{ property: "og:image:alt", content: SITE_TITLE },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:site", content: "@notesofcarl" },
			{ name: "twitter:title", content: SITE_TITLE },
			{ name: "twitter:description", content: SITE_DESCRIPTION },
			{ name: "twitter:image", content: SITE_IMAGE_URL },
		],
		scripts: [{ children: THEME_SCRIPT }],
		links: [
			{ rel: "icon", href: "/favicon.ico", sizes: "any" },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
			{ rel: "icon", href: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
			{ rel: "manifest", href: "/site.webmanifest" },
			{ rel: "alternate", type: "application/rss+xml", title: "CarlNotes", href: "/feed.xml" },
		],
	}),
	// whether the page request brought a session cookie, read once on the server. hasSessionCookie is always false
	// in the browser, so shouldReload keeps a navigation from rerunning the loader
	loader: () => hasSessionCookie(),
	shouldReload: false,
	shellComponent: RootShell,
	component: RootComponent,
})

// the html document, which the server renders even for a route with ssr off. the theme script adds the dark
// class before React hydrates, and suppressHydrationWarning silences the class mismatch
function RootShell({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	)
}

// the routed page inside the query client every page shares, beside the visit analytics
function RootComponent() {
	// create one query client for each server request and each page load in the browser, with no focus re-fetch and no
	// automatic retry
	const [queryClient] = useState(
		() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } } }),
	)
	return (
		<QueryClientProvider client={queryClient}>
			<VisitAnalytics />
			<Outlet />
		</QueryClientProvider>
	)
}

// report each page opened. the app navigates without a page reload, so a route change counts as a view
function VisitAnalytics(): null {
	const { pathname } = useLocation()
	// biome-ignore lint/correctness/useExhaustiveDependencies: the path is the signal to report, not a value read here
	useEffect(() => {
		captureVisit()
	}, [pathname])
	return null
}
