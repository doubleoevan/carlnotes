import { Suspense, useEffect } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { CoffeeSteam } from "@/components/branding/CoffeeSteam"
import { AppChatPanel } from "@/components/chat/AppChatPanel"
import { Footer } from "@/components/layout/Footer"
import { Header } from "@/components/layout/Header"
import { Toaster } from "@/components/primitives/sonner"
import { SearchBar } from "@/components/search/SearchBar"

/**
 * The app shell shared by every route with a header, search bar, page content, and footer
 */
export function Layout() {
	return (
		<div className="min-h-dvh">
			<ScrollToTop />
			<CanonicalLink />
			<Header />
			{/* everything below the hero shares one ambient steam backdrop that restarts fresh on each route change.
			    flow-root pins the backdrop's top edge to the hero's bottom edge, so rings clip there instead of leaving a bare strip */}
			<div className="relative flow-root">
				<CoffeeSteam />
				{/* the search bar overlaps the hero's bottom edge. z-20 keeps it above the hero */}
				<div className="relative z-20 mx-auto -mt-6 max-w-5xl px-safe">
					<SearchBar />
				</div>
				{/* the routed page above the steam. each page is its own bundle, and the Suspense boundary sits here
				    so the header and search bar stay put while the next page arrives */}
				<div className="relative z-10 min-h-dvh">
					<Suspense fallback={<CoffeeLoading />}>
						<Outlet />
					</Suspense>
				</div>
			</div>
			<Footer />
			{/* the shared chat panel instance, mounted here so a route change doesn't remove it */}
			<AppChatPanel />
			{/* the toast host */}
			<Toaster />
		</div>
	)
}

// keep the canonical link on the page the reader is actually on
function CanonicalLink() {
	const { pathname } = useLocation()
	useEffect(() => {
		const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]') ?? document.createElement("link")
		link.rel = "canonical"
		link.href = `${window.location.origin}${pathname}`
		if (!link.isConnected) {
			document.head.append(link)
		}
	}, [pathname])
	return null
}

// scroll back to the top whenever the route changes
function ScrollToTop() {
	const { pathname } = useLocation()
	// biome-ignore lint/correctness/useExhaustiveDependencies: the pathname is the effect's trigger, not an input
	useEffect(() => {
		window.scrollTo(0, 0)
	}, [pathname])
	return null
}
