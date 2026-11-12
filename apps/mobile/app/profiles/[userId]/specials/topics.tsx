import { useLocalSearchParams } from "expo-router"
import { DashboardScreen } from "@/components/dashboard/DashboardScreen"

/**
 * Opens a person's Topic Dashboard.
 */
export default function TopicDashboardScreen() {
	const { userId } = useLocalSearchParams<{ userId: string }>()
	return <DashboardScreen dashboardKind="topicDashboard" subjectId={userId} />
}
