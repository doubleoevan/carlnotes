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
import { useSearchBar } from "@/providers/SearchBarProvider"
import { Header } from "./Header"
import { SectionTargetContext, type SectionTargetRef } from "./SectionAnchor"

// the space left above a section the screen opens at
const SCROLL_TARGET_GAP = 12

/**
 * Keeps menu screens in the web's reading column with native safe areas and pull-to-refresh.
 */
export function PageScreen({
	title,
	icon,
	titleBadge,
	action,
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
	action?: ReactNode
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

	// keep the linked section in view as content above it loads, until the user scrolls
	const scrollViewRef = useRef<ComponentRef<typeof ScrollView>>(null)
	const sectionTargetRef: SectionTargetRef = useRef(null)
	const hasUserScrolledRef = useRef(false)
	function handleContentSizeChange(): void {
		const contentView = scrollViewRef.current?.getInnerViewRef()
		if (!sectionTargetRef.current || !contentView || hasUserScrolledRef.current) {
			return
		}
		sectionTargetRef.current.measureLayout(contentView, (_x, y) => {
			scrollViewRef.current?.scrollTo({ y: y - SCROLL_TARGET_GAP, animated: false })
		})
	}

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
					onContentSizeChange={handleContentSizeChange}
					onScrollBeginDrag={() => {
						hasUserScrolledRef.current = true
					}}
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}
					refreshControl={onRefresh ? <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} /> : undefined}
				>
					{/* the same heading and primary action as the web page */}
					{header ?? (
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
					)}
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
