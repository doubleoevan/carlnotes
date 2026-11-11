import type { ComponentType, ReactNode } from "react"

// platform adapters keep native controls outside the shared row composition. a row with a press opens something from
// anywhere on it but its own links and buttons
type RowSlot = ComponentType<{ children: ReactNode }>
export type SearchResultRowElements = {
	Row: ComponentType<{ children: ReactNode; className?: string; onPress?: () => void }>
	Rank: RowSlot
	Body: ComponentType<{ children: ReactNode; hasRank: boolean }>
	Content: RowSlot
	// the title, with the control that sits right after it
	Title: ComponentType<{ children: ReactNode; aside?: ReactNode }>
	Details: RowSlot
}
export type SearchResultRowProps = {
	className?: string
	rank?: ReactNode
	leading?: ReactNode
	title: ReactNode
	// a control right after the title, such as the icon that opens a Topic's note
	titleAside?: ReactNode
	details: ReactNode
	action?: ReactNode
	onPress?: () => void
}

/**
 * Shares a search row's optional leading control, title with the control beside it, metadata, and trailing action.
 */
export function SearchResultRow({
	className,
	rank,
	leading,
	title,
	titleAside,
	details,
	action,
	onPress,
	elements: { Row, Rank, Body, Content, Title, Details },
}: SearchResultRowProps & { elements: SearchResultRowElements }) {
	return (
		<Row className={className} onPress={onPress}>
			{/* an optional rank precedes the shared row body */}
			{rank != null && <Rank>{rank}</Rank>}
			<Body hasRank={rank != null}>
				{leading}
				<Content>
					<Title aside={titleAside}>{title}</Title>
					<Details>{details}</Details>
				</Content>
				{action}
			</Body>
		</Row>
	)
}
