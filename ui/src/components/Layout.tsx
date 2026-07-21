import { Outlet } from "react-router-dom"
import { Footer } from "@/components/Footer"
import { Header } from "@/components/Header"
import { SearchBar } from "@/components/SearchBar"

/**
 * The app shell shared by every route with a header, search bar, page content, and footer
 */
export function Layout() {
	return (
		<div className="min-h-screen">
			<Header />
			{/* the search bar overlaps the hero's bottom edge. z-20 keeps it above the hero */}
			<div className="relative z-20 mx-auto -mt-6 max-w-5xl px-4">
				<SearchBar />
			</div>
			{/* the routed page: the home topic feed, a single topic, or the topic editor */}
			<Outlet />
			<Footer />
		</div>
	)
}
