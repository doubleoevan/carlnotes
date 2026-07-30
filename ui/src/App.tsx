import { BrowserRouter, Route, Routes } from "react-router-dom"
import { Layout } from "@/components/layout/Layout"
import { AccountPage } from "@/pages/AccountPage"
import { ActivityPage } from "@/pages/ActivityPage"
import { AdminPage } from "@/pages/AdminPage"
import { HomePage } from "@/pages/HomePage"
import { LoginPage } from "@/pages/LoginPage"
import { PricingPage } from "@/pages/PricingPage"
import { PrivacyPage } from "@/pages/PrivacyPage"
import { SignupPage } from "@/pages/SignupPage"
import { TermsPage } from "@/pages/TermsPage"
import { TopicPage } from "@/pages/TopicPage"
import { TopicFeedProvider } from "@/providers/TopicFeedProvider"

/**
 * The global App root. login and signup render without the Layout shell.
 * Every other page shares the Layout shell and one topic feed context
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
					{/* the topic page, which also contains a modal to edit the topic */}
					<Route path="topics/:id" element={<TopicPage />} />
					{/* the signed-in user's activity, account, and the admin-only console */}
					<Route path="activity" element={<ActivityPage />} />
					<Route path="account" element={<AccountPage />} />
					<Route path="admin" element={<AdminPage />} />
					{/* the plan cards side by side */}
					<Route path="pricing" element={<PricingPage />} />
					{/* legal pages, linked from the footer */}
					<Route path="privacy" element={<PrivacyPage />} />
					<Route path="terms" element={<TermsPage />} />
				</Route>
			</Routes>
		</BrowserRouter>
	)
}
