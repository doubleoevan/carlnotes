import type { ComponentType, ReactNode } from "react"

// platform adapters keep native controls outside the shared row composition
type RowSlot = ComponentType<{ children: ReactNode }>
export type SearchResultRowElements = {
	Row: ComponentType<{ children: ReactNode; className?: string }>
	Rank: RowSlot
	Body: ComponentType<{ children: ReactNode; hasRank: boolean }>
	Content: RowSlot
	Title: RowSlot
	Details: RowSlot
}
export type SearchResultRowProps = {
	className?: string
	rank?: ReactNode
	leading: ReactNode
	title: ReactNode
	details: ReactNode
	action?: ReactNode
}

/**
 * Shares a search row's leading control, title, metadata, and trailing action.
 */
export function SearchResultRow({
	className,
	rank,
	leading,
	title,
	details,
	action,
	elements: { Row, Rank, Body, Content, Title, Details },
}: SearchResultRowProps & { elements: SearchResultRowElements }) {
	return (
		<Row className={className}>
			{/* an optional rank precedes the shared row body */}
			{rank != null && <Rank>{rank}</Rank>}
			<Body hasRank={rank != null}>
				{leading}
				<Content>
					<Title>{title}</Title>
					<Details>{details}</Details>
				</Content>
				{action}
			</Body>
		</Row>
	)
}
