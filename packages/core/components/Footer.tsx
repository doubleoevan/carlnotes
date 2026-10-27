import type { ComponentType, ReactNode } from "react"

type Container = ComponentType<{ children: ReactNode }>
export type FooterElements = {
	Root: Container
	Legal: Container
	Row: Container
	Text: Container
	Closing: Container
	Link: ComponentType<{ href: string; isNewTab?: boolean; children: string }>
}

/**
 * Shares the global footer's words, destinations, and row order across web and mobile.
 */
export function Footer({ elements: { Root, Legal, Row, Text, Closing, Link } }: { elements: FooterElements }) {
	return (
		<Root>
			<Legal>
				{/* copyright and license summary */}
				<Row>
					<Text>© 2026 CarlNotes</Text>
					<Text>AGPL-3.0 licensed.</Text>
					<Text>Take the code. Leave the raccoon.</Text>
				</Row>
				{/* public site pages and source */}
				<Row>
					<Link href="/docs" isNewTab>
						What CarlNotes Is
					</Link>
					<Link href="/releases">Releases</Link>
					<Link href="https://github.com/doubleoevan/carlnotes/blob/main/README.md">Source Code</Link>
					<Link href="/nightshift/" isNewTab>
						Nightshift Design System
					</Link>
				</Row>
				{/* the same public legal pages before and after sign-in */}
				<Row>
					<Link href="https://github.com/doubleoevan/carlnotes/blob/main/LICENSE">License</Link>
					<Link href="/privacy">Privacy</Link>
					<Link href="/terms">Terms</Link>
				</Row>
			</Legal>
			<Closing>Carl read all of it.</Closing>
		</Root>
	)
}
