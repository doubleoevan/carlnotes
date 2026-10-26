import { resourceKinds } from "@carlnotes/contracts/enums"
import { TAG_MATCH_MODES, TOPIC_FINDING_SORTS } from "@carlnotes/contracts/findings"
import type { TopicFeedFilters } from "@carlnotes/core/hooks/useTopicFeedState"
import {
	TAG_MATCH_LABELS,
	TOPIC_FINDING_FILTER_LABELS,
	TOPIC_FINDING_SORT_LABELS,
	toTopicFindingFilterOptions,
} from "@carlnotes/core/lib/topicFeedLabels"
import { ArrowUpDown, Check, type LucideIcon, SlidersHorizontal } from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import { View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { RESOURCE_KIND_ICON, TAG_MATCH_ICONS, TOPIC_FINDING_SORT_ICONS } from "./topicFeedIcons"

// every native control writes the same filters as the web
export type TopicFeedControlsProps = {
	filters: TopicFeedFilters
	hasTeamBookmarks?: boolean
	isCompact?: boolean
}
type ChoiceSheetProps = TopicFeedControlsProps & { onClose: () => void }

/**
 * Shows the shared sort and view choices in native sheets.
 */
export function TopicFeedControls({ filters, hasTeamBookmarks = false, isCompact = false }: TopicFeedControlsProps) {
	// return focus to the control that opened the sheet
	const [sheet, setSheet] = useState<"sort" | "filter" | null>(null)
	const sortTriggerRef = useRef<ComponentRef<typeof View>>(null)
	const filterTriggerRef = useRef<ComponentRef<typeof View>>(null)
	const handleClose = (): void => setSheet(null)
	const filterLabel = toFilterLabel({ filters, hasTeamBookmarks })
	return (
		<View className={isCompact ? "flex-row-reverse items-center" : "flex-row flex-wrap gap-3 px-4 py-3"}>
			{/* keep both active choices visible */}
			<Button
				ref={sortTriggerRef}
				variant={isCompact ? "ghost" : "outline"}
				size={isCompact ? "icon" : "default"}
				accessibilityLabel={`Sort: ${TOPIC_FINDING_SORT_LABELS[filters.sort]}`}
				onPress={() => setSheet("sort")}
			>
				<Icon as={ArrowUpDown} className="text-muted-foreground" />
				{!isCompact ? <Text>{TOPIC_FINDING_SORT_LABELS[filters.sort]}</Text> : null}
			</Button>
			<Button
				ref={filterTriggerRef}
				variant={isCompact ? "ghost" : "outline"}
				size={isCompact ? "icon" : "default"}
				accessibilityLabel={`Filters: ${filterLabel}`}
				onPress={() => setSheet("filter")}
			>
				<Icon as={SlidersHorizontal} className="text-muted-foreground" />
				{!isCompact ? <Text>{filterLabel}</Text> : null}
			</Button>
			{/* each sheet owns one group of choices */}
			{sheet === "sort" ? (
				<Sheet title="Sort" triggerRef={sortTriggerRef} onClose={handleClose}>
					<SortChoices filters={filters} onClose={handleClose} />
				</Sheet>
			) : null}
			{sheet === "filter" ? (
				<Sheet title="Filters" triggerRef={filterTriggerRef} onClose={handleClose}>
					<FilterChoices filters={filters} hasTeamBookmarks={hasTeamBookmarks} onClose={handleClose} />
				</Sheet>
			) : null}
		</View>
	)
}

// name the active bookmark scope on eligible topics
function toFilterLabel({ filters, hasTeamBookmarks }: TopicFeedControlsProps): string {
	const options = toTopicFindingFilterOptions({ hasTeamBookmarks: Boolean(hasTeamBookmarks), isSignedIn: true })
	return (
		options.find(
			(option) =>
				option.filter === filters.findingFilter &&
				(!option.bookmarkScope || option.bookmarkScope === filters.bookmarkScope),
		)?.label ?? TOPIC_FINDING_FILTER_LABELS[filters.findingFilter]
	)
}

// select a sort without another network read
function SortChoices({ filters, onClose }: ChoiceSheetProps) {
	return (
		<View className="gap-3">
			{TOPIC_FINDING_SORTS.map((sort) => (
				<Choice
					key={sort}
					label={TOPIC_FINDING_SORT_LABELS[sort]}
					icon={TOPIC_FINDING_SORT_ICONS[sort]}
					isSelected={sort === filters.sort}
					onSelect={() => {
						// apply the sort and close its sheet
						filters.setSort(sort)
						onClose()
					}}
				/>
			))}
		</View>
	)
}

// keep team bookmark choices available until their scope is selected
function FilterChoices({ filters, hasTeamBookmarks, onClose }: ChoiceSheetProps) {
	return (
		<View className="gap-3">
			{/* resource kinds remain selectable without closing the sheet */}
			<View className="border-t border-separator pt-3">
				{resourceKinds.map((resourceKind) => (
					<Choice
						key={resourceKind}
						label={{ read: "Read", watch: "Watch", listen: "Listen" }[resourceKind]}
						icon={RESOURCE_KIND_ICON[resourceKind]}
						isSelected={filters.resourceKinds.has(resourceKind)}
						onSelect={() => filters.toggleResourceKind(resourceKind)}
					/>
				))}
			</View>
			<View className="border-t border-separator" />
			{/* the web's direct personal and Team bookmark choices */}
			{toTopicFindingFilterOptions({ hasTeamBookmarks: Boolean(hasTeamBookmarks), isSignedIn: true }).map((option) => (
				<Choice
					key={option.label}
					label={option.label}
					isSelected={
						option.filter === filters.findingFilter &&
						(!option.bookmarkScope || option.bookmarkScope === filters.bookmarkScope)
					}
					onSelect={() => {
						// apply the view and its bookmark scope together
						filters.setFindingFilter(option.filter)
						if (option.bookmarkScope) {
							filters.setBookmarkScope(option.bookmarkScope)
						}
						onClose()
					}}
				/>
			))}
			{/* tag matching uses the web's same four modes */}
			<View className="border-t border-separator pt-3">
				<Text className="px-3 text-xs text-muted-foreground">Tags</Text>
				{TAG_MATCH_MODES.map((mode) => (
					<Choice
						key={mode}
						label={TAG_MATCH_LABELS[mode]}
						icon={TAG_MATCH_ICONS[mode]}
						isSelected={filters.tagMatchMode === mode}
						onSelect={() => {
							filters.setTagMatchMode(mode)
							onClose()
						}}
					/>
				))}
			</View>
		</View>
	)
}

// announce the selected state on every choice
function Choice({
	label,
	icon,
	isSelected,
	onSelect,
}: {
	label: string
	icon?: LucideIcon
	isSelected: boolean
	onSelect: () => void
}) {
	return (
		<Button
			variant={isSelected ? "secondary" : "ghost"}
			accessibilityLabel={label}
			accessibilityState={{ selected: isSelected }}
			onPress={onSelect}
			className="justify-start min-h-12"
		>
			{icon ? <Icon as={icon} className="text-muted-foreground" /> : null}
			<Text className="flex-1 text-left">{label}</Text>
			{isSelected ? <Icon as={Check} /> : null}
		</Button>
	)
}
