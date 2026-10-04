import { Outlet } from "@tanstack/react-router"
import { Suspense } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { CoffeeSteam } from "@/components/branding/CoffeeSteam"
import { AppChatPanel } from "@/components/chat/AppChatPanel"
import { Footer } from "@/components/layout/Footer"
import { Header } from "@/components/layout/Header"
import { PodcastEpisodeAudio } from "@/components/podcast/PodcastEpisodeAudio"
import { Toaster } from "@/components/primitives/sonner"
import { SearchBar } from "@/components/search/SearchBar"

/**
 * The app shell shared by every route with a header, search bar, page content, and footer
 */
export function Layout() {
	return (
		<div className="min-h-dvh">
			<Header />
			{/* everything below the hero shares one ambient steam backdrop that restarts fresh on each route change.
			    flow-root pins the backdrop's top edge to the hero's bottom edge, so rings clip there instead of leaving a bare strip */}
			<div className="relative flow-root">
				<CoffeeSteam />
				{/* the search bar overlaps the hero's bottom edge. z-20 keeps it above the hero */}
				<div className="relative z-20 mx-auto -mt-6 max-w-5xl px-safe">
					<SearchBar />
				</div>
				{/* the routed page above the steam. a page that suspends shows the loading mug here */}
				<div className="relative z-10 min-h-dvh">
					<Suspense fallback={<CoffeeLoading />}>
						<Outlet />
					</Suspense>
				</div>
			</div>
			<Footer />
			{/* the shared chat panel instance, mounted here so a route change doesn't remove it */}
			<AppChatPanel />
			{/* the podcast's audio element and the podcast player, mounted here so playback outlives a route change */}
			<PodcastEpisodeAudio />
			{/* the toast host */}
			<Toaster />
		</div>
	)
}
