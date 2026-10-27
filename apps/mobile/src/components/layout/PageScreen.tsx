import { cn } from "@carlnotes/nightshift/classNames"
import type { LucideIcon } from "lucide-react-native"
import type { ReactNode } from "react"
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

/**
 * Keeps menu screens in the web's reading column with native safe areas and pull-to-refresh.
 */
export function PageScreen({
	title,
	icon,
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
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}
					refreshControl={onRefresh ? <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} /> : undefined}
				>
					{/* the same heading and primary action as the web page */}
					{header ?? (
						<View className="flex-row flex-wrap items-center justify-between gap-3">
							<View className="flex-row items-center gap-2">
								{icon && <Icon as={icon} className="size-6 text-foreground" />}
								<Text accessibilityRole="header" className="font-display text-2xl">
									{title}
								</Text>
							</View>
							{action}
						</View>
					)}
					{byline && <View className="mt-2">{byline}</View>}
					<View className={cn("mt-6 gap-6", contentClassName)}>{children}</View>
					<Footer />
				</ScrollView>
			</ClassNameSafeAreaView>
		</View>
	)
}
