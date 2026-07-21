import { BrowserRouter, Route, Routes } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { EditTopicPage } from "@/pages/EditTopicPage"
import { HomePage } from "@/pages/HomePage"
import { TopicPage } from "@/pages/TopicPage"
import { TopicFeedProvider } from "@/providers/TopicFeedProvider"

/**
 * The global app root. one shared topic feed context. the router mounts every page inside the Layout Outlet
 */
export function App() {
	return (
		<TopicFeedProvider>
			<BrowserRouter>
				<Routes>
					{/* every page renders inside the Layout Output, which adds the header, search bar, and footer */}
					<Route element={<Layout />}>
						{/* home */}
						<Route index element={<HomePage />} />
						{/* a single topic, and its editor */}
						<Route path="topics/:id" element={<TopicPage />} />
						<Route path="topics/:id/edit" element={<EditTopicPage />} />
					</Route>
				</Routes>
			</BrowserRouter>
		</TopicFeedProvider>
	)
}
