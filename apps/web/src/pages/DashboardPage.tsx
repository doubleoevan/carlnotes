// a Dashboard page, Topic, Podcast, or Team Dashboard, laid out like the Activity page: the page icon and heading with
// the New Topic button to the right on the user's own page and on every team's, the person's or team's subject
// header with the summary counts under it and the team dropdown in the team's name's place on Team Dashboard, then the
// accordion of chart sections with every one open, Carl's paragraph in the first
import {
	DASHBOARD_PAGE_NAMES,
	type DashboardKind,
	type DashboardResponse,
	toDashboardPath,
} from "@carlnotes/contracts/dashboards"
import { Dashboard } from "@carlnotes/core/components/Dashboard"
import { TeamDropdown } from "@carlnotes/core/components/TeamDropdown"
import { DASHBOARD_NOT_FOUND_LINE, useDashboardPage } from "@carlnotes/core/hooks/useDashboardPage"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import { useNavigate } from "@tanstack/react-router"
import { Share } from "lucide-react"
import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard/DashboardHeader"
import { toWebDashboardElements, WEB_TEAM_DROPDOWN_ELEMENTS } from "@/components/dashboard/dashboardElements"
import { WEB_DASHBOARD_CHART_RENDERERS } from "@/components/dashboard/webDashboardChartRenderers"
import { ShareDashboard } from "@/components/share/ShareDashboard"
import { NewTopicButton, useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { useColorMode } from "@/hooks/useColorMode"
import { usePageTitle } from "@/hooks/usePageTitle"
import { PAGE_CLASS } from "@/lib/styleClasses"
import { captureVisitEvent } from "@/lib/visitAnalytics"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

// the web's Dashboard elements with its chart renderers
const DASHBOARD_ELEMENTS = toWebDashboardElements(WEB_DASHBOARD_CHART_RENDERERS)

// the page's Dashboard, and the server's public read of its default selection
type DashboardPageProps = {
	dashboardKind: DashboardKind
	subjectId: string
	initialDashboard: DashboardResponse | null
}

/**
 * Shows one Dashboard page for its person or team.
 */
export function DashboardPage({ dashboardKind, subjectId, initialDashboard }: DashboardPageProps) {
	// the router, the color mode the series follow, whether the Share dialog is open, and the page's name
	const navigate = useNavigate()
	const colorMode = useColorMode()
	const [isSharing, setIsSharing] = useState(false)
	const pageName = DASHBOARD_PAGE_NAMES[dashboardKind]

	// the user's access, the subject header's subject and summary, the page title, whether the Dashboard is missing, and
	// the team dropdown
	const {
		hasFullAccess,
		isOwner,
		hasNewTopicButton,
		subject,
		summary,
		pageTitle,
		isMissing,
		hasTeamDropdown,
		teamDropdown,
	} = useDashboardPage({
		dashboardKind,
		subjectId,
		initialDashboard,
	})
	usePageTitle(pageTitle)

	// the New Topic button's dialog
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()

	// the search bar's menu offers Share, and leaves out New topic while the page shows its own New Topic button
	useRegisterPageActions({
		page: pageName,
		options: [{ label: "Share", Icon: Share, onSelect: () => setIsSharing(true) }],
		hasNewTopicButton,
	})

	// an item's page, at its anchor if the path names one, such as a topic's film
	const handleItemPress = (path: string): void => {
		const [pathname = path, hash] = path.split("#")
		void navigate({ to: pathname, hash })
	}

	return (
		<main className={PAGE_CLASS}>
			{/* the page heading with the New Topic button to the right, and the subject header under it with the team
			    dropdown in the team's name's place */}
			<DashboardHeader
				dashboardKind={dashboardKind}
				subject={subject}
				summary={summary}
				isSubjectHeaderShown={!isMissing}
				hasTeamDropdown={hasTeamDropdown}
				teamDropdown={
					teamDropdown && (
						<TeamDropdown
							{...teamDropdown}
							onTeamChange={(teamId) => navigate({ to: toDashboardPath({ dashboardKind, subjectId: teamId }) })}
							elements={WEB_TEAM_DROPDOWN_ELEMENTS}
						/>
					)
				}
				action={hasNewTopicButton && <NewTopicButton onNewTopic={openNewTopicDialog} />}
			/>

			{/* the not-found line, or the page's body */}
			{isMissing ? (
				<p className="text-muted-foreground mt-6 text-sm">{DASHBOARD_NOT_FOUND_LINE}</p>
			) : (
				<Dashboard
					dashboardKind={dashboardKind}
					subjectId={subjectId}
					hasFullAccess={hasFullAccess}
					isOwner={isOwner}
					initialDashboard={initialDashboard}
					seriesColors={toChartSeriesColors(colorMode)}
					captureVisitEvent={captureVisitEvent}
					onItemPress={handleItemPress}
					elements={DASHBOARD_ELEMENTS}
				/>
			)}

			{/* the dialog that the New Topic button opens */}
			{newTopicDialog}

			{/* the Share dialog the menu's Share opens */}
			{isSharing && (
				<ShareDashboard
					dashboardKind={dashboardKind}
					subjectId={subjectId}
					title={pageTitle ?? pageName}
					onClose={() => setIsSharing(false)}
				/>
			)}
		</main>
	)
}
