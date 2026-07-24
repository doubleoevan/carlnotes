import { BrowserRouter, Route, Routes } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { useTheme } from "@/hooks/useTheme"
import { EditTopicPage } from "@/pages/EditTopicPage"
import { HomePage } from "@/pages/HomePage"
import { LoginPage } from "@/pages/LoginPage"
import { SignupPage } from "@/pages/SignupPage"
import { TopicPage } from "@/pages/TopicPage"
import { TopicFeedProvider } from "@/providers/TopicFeedProvider"

/**
 * The global app root. login and signup render bare; every other page shares the Layout shell and
 * one topic feed context. no route is gated behind a session — only individual features are
 */
export function App() {
	// syncs the saved theme to the HTML element up front — login and signup render outside Header, the only
	// other place this hook runs, so without this they'd always show light regardless of the saved theme
	useTheme()
	return (
		<BrowserRouter>
			<Routes>
				{/* auth pages, rendered bare with no header and no topic feed */}
				<Route path="login" element={<LoginPage />} />
				<Route path="signup" element={<SignupPage />} />
				{/* every other page shares one topic feed context and the Layout shell (header, search bar, footer) */}
				<Route
					element={
						<TopicFeedProvider>
							<Layout />
						</TopicFeedProvider>
					}
				>
					<Route index element={<HomePage />} />
					<Route path="topics/:id" element={<TopicPage />} />
					<Route path="topics/:id/edit" element={<EditTopicPage />} />
				</Route>
			</Routes>
		</BrowserRouter>
	)
}
