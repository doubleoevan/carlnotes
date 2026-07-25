import { BrowserRouter, Route, Routes } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { HomePage } from "@/pages/HomePage"
import { LoginPage } from "@/pages/LoginPage"
import { PrivacyPage } from "@/pages/PrivacyPage"
import { SignupPage } from "@/pages/SignupPage"
import { TermsPage } from "@/pages/TermsPage"
import { TopicPage } from "@/pages/TopicPage"
import { TopicFeedProvider } from "@/providers/TopicFeedProvider"

/**
 * The global app root. login and signup render bare; every other page shares the Layout shell and
 * one topic feed context. no route is gated behind a session — only individual features are
 */
export function App() {
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
					{/* the topic pate which contains a modal to edit the topic */}
					<Route path="topics/:id" element={<TopicPage />} />
					{/* legal pages, linked from the footer */}
					<Route path="privacy" element={<PrivacyPage />} />
					<Route path="terms" element={<TermsPage />} />
				</Route>
			</Routes>
		</BrowserRouter>
	)
}
