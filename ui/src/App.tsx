import { lazy, Suspense } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Layout } from "@/components/layout/Layout"
import { TopicFeedProvider } from "@/providers/TopicFeedProvider"

// each page is fetched on the route that needs it, so a visitor downloads one page and not the whole app.
// each then call unwraps the page's named export into the default export lazy expects
const AccountPage = lazy(() => import("@/pages/AccountPage").then((page) => ({ default: page.AccountPage })))
const ActivityPage = lazy(() => import("@/pages/ActivityPage").then((page) => ({ default: page.ActivityPage })))
const AdminPage = lazy(() => import("@/pages/AdminPage").then((page) => ({ default: page.AdminPage })))
const HomePage = lazy(() => import("@/pages/HomePage").then((page) => ({ default: page.HomePage })))
const LoginPage = lazy(() => import("@/pages/LoginPage").then((page) => ({ default: page.LoginPage })))
const PricingPage = lazy(() => import("@/pages/PricingPage").then((page) => ({ default: page.PricingPage })))
const PrivacyPage = lazy(() => import("@/pages/PrivacyPage").then((page) => ({ default: page.PrivacyPage })))
const SignupPage = lazy(() => import("@/pages/SignupPage").then((page) => ({ default: page.SignupPage })))
const TermsPage = lazy(() => import("@/pages/TermsPage").then((page) => ({ default: page.TermsPage })))
const TopicPage = lazy(() => import("@/pages/TopicPage").then((page) => ({ default: page.TopicPage })))

/**
 * The global App root. login and signup render without the Layout shell.
 * Every other page shares the Layout shell and one topic feed context
 */
export function App() {
	return (
		<BrowserRouter>
			<Routes>
				{/* the auth pages render bare, with no header and no topic feed, so each includes its own
				    Suspense fallback instead of the one that Layout holds for every other page */}
				<Route
					path="login"
					element={
						<Suspense fallback={<CoffeeLoading />}>
							<LoginPage />
						</Suspense>
					}
				/>
				<Route
					path="signup"
					element={
						<Suspense fallback={<CoffeeLoading />}>
							<SignupPage />
						</Suspense>
					}
				/>
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
