import { useLocalSearchParams } from "expo-router"
import { DashboardScreen } from "@/components/dashboard/DashboardScreen"

/**
 * Opens a team's Team Dashboard.
 */
export default function TeamDashboardScreen() {
	const { teamId } = useLocalSearchParams<{ teamId: string }>()
	return <DashboardScreen dashboardKind="teamDashboard" subjectId={teamId} />
}
