import { useLocalSearchParams } from "expo-router"
import { DashboardScreen } from "@/components/dashboard/DashboardScreen"

/**
 * Opens a person's Podcast Dashboard.
 */
export default function PodcastDashboardScreen() {
	const { userId } = useLocalSearchParams<{ userId: string }>()
	return <DashboardScreen dashboardKind="podcastDashboard" subjectId={userId} />
}
