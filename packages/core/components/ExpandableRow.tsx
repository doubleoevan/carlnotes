import { cn } from "@carlnotes/nightshift/classNames"
import { type ExpandableRowSharedProps, expandableRowClasses } from "@carlnotes/nightshift/components/expandable-row"
import { type ComponentProps, type ComponentType, type ReactNode, useId, useState } from "react"
import type { AccountFieldElements } from "./AccountFields"

// platform elements provide semantic controls while the row owns its state and content order
export type ExpandableRowElements = Pick<AccountFieldElements, "Text"> & {
	Title: ComponentType<ComponentProps<AccountFieldElements["Text"]> & { isSection: boolean }>
	Row: ComponentType<{ children: ReactNode; className?: string }>
	Disclosure: ComponentType<{
		children: ReactNode
		label: string
		isExpanded: boolean
		contentId: string
		onPress: () => void
	}>
	Details: ComponentType<{ children: ReactNode; id: string; className: string }>
	Chevron: ComponentType<{ isExpanded: boolean }>
}
export type ExpandableRowProps = ExpandableRowSharedProps & {
	children: ReactNode
}

/**
 * Shares the Source and entry disclosures, mounting private details only while expanded. A list that keeps one row open
 * passes isExpanded and onToggleExpanded, and every other row keeps its own state.
 */
export function ExpandableRow({
	elements,
	title,
	metadata,
	tag,
	ordinal,
	initialOpen = false,
	isExpanded,
	onToggleExpanded,
	isFirst = false,
	isLast = false,
	variant = "item",
	children,
}: ExpandableRowProps & { elements: ExpandableRowElements }) {
	// keep disclosure identity stable through refreshes and retire its children on collapse
	const [isOpen, setIsOpen] = useState(initialOpen)
	const isShowingDetails = isExpanded ?? isOpen
	const contentId = useId()
	const isSection = variant === "section"
	const { Row, Disclosure, Details, Text, Title, Chevron } = elements
	return (
		<Row
			className={cn(
				expandableRowClasses.row,
				isFirst && expandableRowClasses.firstRow,
				isLast && expandableRowClasses.lastRow,
				isSection && expandableRowClasses.sectionRow,
			)}
		>
			{/* one trigger controls the whole disclosure */}
			<Disclosure
				label={[ordinal, tag, title, metadata].filter(Boolean).join(", ")}
				isExpanded={isShowingDetails}
				contentId={contentId}
				onPress={onToggleExpanded ?? (() => setIsOpen(!isOpen))}
			>
				{ordinal !== undefined && <Text className={expandableRowClasses.ordinal}>{ordinal}</Text>}
				{tag && <Text className={expandableRowClasses.tag}>{tag}</Text>}
				<Title
					isSection={isSection}
					className={cn(expandableRowClasses.title, isSection && expandableRowClasses.sectionTitle)}
				>
					{title}
				</Title>
				<Text className={expandableRowClasses.metadata}>{metadata}</Text>
				<Chevron isExpanded={isShowingDetails} />
			</Disclosure>
			{/* links and destructive actions remain outside the trigger */}
			{isShowingDetails && (
				<Details
					id={contentId}
					className={cn(expandableRowClasses.details, !isSection && expandableRowClasses.itemDetails)}
				>
					{children}
				</Details>
			)}
		</Row>
	)
}
