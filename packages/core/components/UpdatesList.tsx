import { EMPTY_UPDATES_TEXT, UPDATES_TITLE, type Updates } from "@carlnotes/contracts/updates"
import type { ComponentType, ReactNode } from "react"

// platform elements keep the list's text and links native
export type UpdatesListElements = {
	Card: ComponentType<{ children: ReactNode }>
	Heading: ComponentType<{ action?: ReactNode; children: ReactNode }>
	Opener: ComponentType<{ children: ReactNode }>
	EmptyState: ComponentType<{ children: ReactNode }>
}

/**
 * Shows a list in one card under its heading, and the placeholder in that card until the list loads. The action sits
 * at the card's top right, and findings holds the platform's own rows.
 */
export function UpdatesList({
	updates,
	findings,
	placeholder,
	action,
	elements,
}: {
	updates?: Updates
	findings?: ReactNode
	placeholder?: ReactNode
	action?: ReactNode
	elements: UpdatesListElements
}) {
	const { Card, Heading, ...contentElements } = elements
	return (
		<Card>
			<Heading action={action}>{UPDATES_TITLE}</Heading>
			{updates ? (
				<UpdatesContent updates={updates} elements={contentElements}>
					{findings}
				</UpdatesContent>
			) : (
				placeholder
			)}
		</Card>
	)
}

// carl's opener and the rows
function UpdatesContent({
	updates,
	elements: { Opener, EmptyState },
	children,
}: {
	updates: Updates
	elements: Omit<UpdatesListElements, "Card" | "Heading">
	children: ReactNode
}) {
	if (updates.findings.length === 0) {
		return <EmptyState>{EMPTY_UPDATES_TEXT}</EmptyState>
	}
	return (
		<>
			{/* a list without an opener starts at its first Finding */}
			{updates.opener && <Opener>{updates.opener}</Opener>}
			{children}
		</>
	)
}
