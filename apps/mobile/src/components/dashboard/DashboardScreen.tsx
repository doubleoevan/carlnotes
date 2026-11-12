// a Dashboard screen, Topic, Podcast, or Team Dashboard, laid out like the Activity screen: the page icon and heading,
// the person's or team's byline with its summary counts under it and the team dropdown in the team's name's place, then
// the chart sections with every one open, Carl's paragraph in the first
import {
	DASHBOARD_PAGE_HEADINGS,
	DASHBOARD_PAGE_NAMES,
	type DashboardKind,
	toDashboardPath,
} from "@carlnotes/contracts/dashboards"
import { SITE_URL } from "@carlnotes/contracts/site"
import { AvatarHeaderSkeleton } from "@carlnotes/core/components/AvatarHeader"
import { Dashboard } from "@carlnotes/core/components/Dashboard"
import {
	DashboardSubjectHeader,
	type DashboardSubjectHeaderElements,
} from "@carlnotes/core/components/DashboardSubjectHeader"
import { TeamDropdown } from "@carlnotes/core/components/TeamDropdown"
import { DASHBOARD_NOT_FOUND_LINE, useDashboardPage } from "@carlnotes/core/hooks/useDashboardPage"
import { toDashboardQueryKey } from "@carlnotes/core/hooks/useDashboardSnapshot"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import { useQueryClient } from "@tanstack/react-query"
import { router } from "expo-router"
import { Share as ShareIcon } from "lucide-react-native"
import {
	MOBILE_AVATAR_HEADER_ELEMENTS,
	MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS,
} from "@/components/common/avatarHeaderElements"
import { DetailsLine } from "@/components/common/DetailsLine"
import { PageHeading, PageScreen } from "@/components/layout/PageScreen"
import { Text } from "@/components/primitives/text"
import { openShareSheet } from "@/components/share/shareSheet"
import { toPlatformPath } from "@/platformPath"
import { useColorMode } from "@/theme"
import { captureVisitEvent } from "@/visitAnalytics"
import { MOBILE_DASHBOARD_ELEMENTS, MOBILE_TEAM_DROPDOWN_ELEMENTS } from "./dashboardElements"
import { DASHBOARD_PAGE_ICONS } from "./dashboardPageIcons"

/**
 * Shows one Dashboard screen for its person or team.
 */
export function DashboardScreen({ dashboardKind, subjectId }: { dashboardKind: DashboardKind; subjectId: string }) {
	// the color mode the series follow, the query cache a refresh reads again, and the page's name
	const colorMode = useColorMode()
	const queryClient = useQueryClient()
	const pageName = DASHBOARD_PAGE_NAMES[dashboardKind]
	const pageHeading = DASHBOARD_PAGE_HEADINGS[dashboardKind]

	// the reader, the byline's subject and summary, the page title, and the team dropdown
	const { hasFullAccess, isOwner, subject, summary, pageTitle, isMissing, hasTeamDropdown, teamDropdown } =
		useDashboardPage({
			dashboardKind,
			subjectId,
			initialDashboard: null,
		})

	// the operating system's share sheet with the page's title and url, reported by its channel with the Dashboard's ids
	const handleShare = (): void => {
		captureVisitEvent("social_dashboard_share", { dashboardKind, subjectId, channel: "share-sheet" })
		const url = `${SITE_URL}${toDashboardPath({ dashboardKind, subjectId })}`
		void openShareSheet({ title: pageTitle ?? pageName, url })
	}
	return (
		<PageScreen
			title={pageName}
			header={<PageHeading title={pageHeading} icon={DASHBOARD_PAGE_ICONS[dashboardKind]} />}
			byline={
				isMissing ? null : subject ? (
					<DashboardSubjectHeader
						subject={subject}
						summary={summary}
						teamDropdown={
							teamDropdown && (
								<TeamDropdown
									{...teamDropdown}
									onTeamChange={(teamId) => router.replace(toDashboardPath({ dashboardKind, subjectId: teamId }))}
									elements={MOBILE_TEAM_DROPDOWN_ELEMENTS}
								/>
							)
						}
						elements={SUBJECT_HEADER_ELEMENTS}
					/>
				) : (
					<AvatarHeaderSkeleton
						hasDetails
						hasTeamDropdown={hasTeamDropdown}
						elements={MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS}
					/>
				)
			}
			contentClassName="mt-2 gap-0"
			options={[{ label: "Share", icon: ShareIcon, onSelect: handleShare }]}
			onRefresh={() =>
				void queryClient.invalidateQueries({ queryKey: toDashboardQueryKey({ dashboardKind, subjectId }) })
			}
		>
			{/* the not-found line, or the screen's body */}
			{isMissing ? (
				<Text className="mt-6 text-sm text-muted-foreground">{DASHBOARD_NOT_FOUND_LINE}</Text>
			) : (
				<Dashboard
					dashboardKind={dashboardKind}
					subjectId={subjectId}
					hasFullAccess={hasFullAccess}
					isOwner={isOwner}
					initialDashboard={null}
					seriesColors={toChartSeriesColors(colorMode)}
					captureVisitEvent={captureVisitEvent}
					onItemPress={(path) => router.push(toPlatformPath(path.replace(/#.*/, "")))}
					elements={MOBILE_DASHBOARD_ELEMENTS}
				/>
			)}
		</PageScreen>
	)
}

// the app's avatar header with the summary strip's details line
const SUBJECT_HEADER_ELEMENTS: DashboardSubjectHeaderElements = { ...MOBILE_AVATAR_HEADER_ELEMENTS, DetailsLine }
