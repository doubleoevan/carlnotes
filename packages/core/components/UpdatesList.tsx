import { EMPTY_UPDATES_TEXT, UPDATES_TITLE, type Updates } from "@carlnotes/contracts/updates"
import type { ComponentType, ReactNode } from "react"

// platform elements keep the list's text and links native
export type UpdatesListElements = {
	Card: ComponentType<{ children: ReactNode }>
	Heading: ComponentType<{ children: ReactNode }>
	Opener: ComponentType<{ children: ReactNode }>
	EmptyState: ComponentType<{ children: ReactNode }>
}

/**
 * Shows a list in one card under its heading: carl's opener, then the platform's own rows, or the empty line for a
 * list with no Finding.
 */
export function UpdatesList({
	updates,
	findings,
	elements: { Card, Heading, Opener, EmptyState },
}: {
	updates: Updates
	findings: ReactNode
	elements: UpdatesListElements
}) {
	return (
		<Card>
			<Heading>{UPDATES_TITLE}</Heading>
			{updates.findings.length === 0 ? (
				<EmptyState>{EMPTY_UPDATES_TEXT}</EmptyState>
			) : (
				<>
					{/* a list without an opener starts at its first Finding */}
					{updates.opener && <Opener>{updates.opener}</Opener>}
					{findings}
				</>
			)}
		</Card>
	)
}
