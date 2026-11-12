import { cn } from "@carlnotes/nightshift/classNames"
import type { LucideIcon } from "lucide-react-native"
import { type ComponentRef, type ReactNode, useRef } from "react"
import { RefreshControl, ScrollView, View } from "react-native"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import type { ReportSubject } from "@/components/common/ReportIssueDialog"
import { Footer } from "@/components/layout/Footer"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { PageActionMenu, type PageActionOption } from "@/components/search/PageActionMenu"
import { SearchBar } from "@/components/search/SearchBar"
import { useSectionTargetScroll } from "@/hooks/useSectionTargetScroll"
import { AVATAR_HEADER_BUTTON_ROW_CLASS } from "@/pageButtonClasses"
import { useSearchBar } from "@/providers/SearchBarProvider"
import { Header } from "./Header"
import { SectionTargetContext } from "./SectionAnchor"

/**
 * Keeps menu screens in the web's reading column with native safe areas and pull-to-refresh.
 */
export function PageScreen({
	title,
	icon,
	titleBadge,
	action,
	leftButton,
	topicButton,
	children,
	onRefresh,
	isRefreshing = false,
	header,
	options,
	report,
	byline,
	contentClassName,
	hasNewTopicButton,
}: {
	title: string
	icon?: LucideIcon
	// the page's update count beside its title
	titleBadge?: ReactNode
	// the button at the right of the title's row
	action?: ReactNode
	// the buttons of a screen whose header is an avatar and a name, in a row under the search bar: the screen's own at
	// the left in the plain style, and the highlighted topic button at the right
	leftButton?: ReactNode
	topicButton?: ReactNode
	children: ReactNode
	onRefresh?: () => void
	isRefreshing?: boolean
	header?: ReactNode
	options?: PageActionOption[]
	report?: ReportSubject
	byline?: ReactNode
	contentClassName?: string
	hasNewTopicButton?: boolean
}) {
	const { filters } = useSearchBar()

	// keep the linked section or comment in view as content above it loads, until the user scrolls
	const scrollViewRef = useRef<ComponentRef<typeof ScrollView>>(null)
	const { sectionTargetRef, scrollHandlers } = useSectionTargetScroll(scrollViewRef)

	return (
		<View className="flex-1 bg-background">
			<Header />
			<SearchBar
				filters={filters}
				hasSort={false}
				actions={
					<PageActionMenu page={title} options={options} report={report} hasNewTopicButton={hasNewTopicButton} />
				}
			/>
			<ClassNameSafeAreaView edges={["left", "right", "bottom"]} className="w-full max-w-3xl flex-1 self-center">
				<ScrollView
					ref={scrollViewRef}
					{...scrollHandlers}
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}
					refreshControl={onRefresh ? <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} /> : undefined}
				>
					{/* the row of buttons above an avatar header, as on the web page */}
					{(leftButton || topicButton) && (
						<View className={AVATAR_HEADER_BUTTON_ROW_CLASS}>
							{leftButton || <View />}
							{topicButton}
						</View>
					)}
					{/* the same heading and primary action as the web page */}
					{header ?? <PageHeading title={title} icon={icon} titleBadge={titleBadge} action={action} />}
					{byline && <View className="mt-2">{byline}</View>}
					<View className={cn("mt-6 gap-6", contentClassName)}>
						<SectionTargetContext value={sectionTargetRef}>{children}</SectionTargetContext>
					</View>
					<Footer />
				</ScrollView>
			</ClassNameSafeAreaView>
		</View>
	)
}

/**
 * Shows a screen's icon and heading with its badge, and the action at the right of the row, which wraps under the
 * heading if the row is too narrow. A screen whose heading differs from its page name passes it as its header.
 */
export function PageHeading({
	title,
	icon,
	titleBadge,
	action,
}: {
	title: string
	icon?: LucideIcon
	titleBadge?: ReactNode
	action?: ReactNode
}) {
	return (
		<View className="flex-row flex-wrap items-center justify-between gap-3">
			<View className="max-w-full flex-row items-center gap-2">
				{icon && <Icon as={icon} className="size-6 text-foreground" />}
				<Text accessibilityRole="header" className="shrink font-display text-2xl">
					{title}
				</Text>
				{titleBadge}
			</View>
			{action}
		</View>
	)
}
