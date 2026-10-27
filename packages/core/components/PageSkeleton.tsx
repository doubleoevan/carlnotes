import type { ComponentType, ReactNode } from "react"

// the page shapes and portable elements shared by the browser and native renderers
export type PageSkeletonKind = "profile" | "teams" | "activity" | "account" | "team"
type Container = ComponentType<{ children: ReactNode; className?: string }>
export type PageSkeletonElements = {
	Root: ComponentType<{ children: ReactNode; label: string }>
	Stack: Container
	Row: Container
	Shape: ComponentType<{ className: string }>
}
export type PageSkeletonProps = { kind: PageSkeletonKind }
const TABLE_ROW_KEYS = ["first", "second", "third", "fourth", "fifth"]
const PAGE_SECTIONS: Record<Exclude<PageSkeletonKind, "account">, string[]> = {
	profile: ["topics", "teams"],
	teams: ["teams"],
	activity: ["subscriptions", "invitations"],
	team: ["members", "topics", "notes"],
}

/**
 * Reserves each page's identity, tables, or budget using one layout on web and mobile.
 */
export function PageSkeleton({ kind, elements }: PageSkeletonProps & { elements: PageSkeletonElements }) {
	// keep known page titles and actions outside the loading content
	const { Root, Stack, Row, Shape } = elements
	const hasIdentity = kind === "profile" || kind === "team"
	return (
		<Root label={`Loading ${kind}`}>
			<Stack>
				{/* profiles and team details load their identity with their tables */}
				{hasIdentity && <IdentitySkeleton elements={elements} />}
				{kind === "activity" && (
					<Row className="gap-2">
						<Shape className="size-6 rounded-full" />
						<Shape className="h-4 w-24" />
					</Row>
				)}
				{/* account settings stay usable while the budget arrives */}
				{kind === "account" ? (
					<BudgetSkeleton elements={elements} />
				) : (
					<Stack className={hasIdentity || kind === "activity" ? "mt-2" : undefined}>
						{PAGE_SECTIONS[kind].map((sectionKey) => (
							<Stack key={sectionKey} className="mb-3">
								<Row className="min-h-12 gap-2 py-3">
									<Shape className="size-4" />
									<Shape className="h-6 w-40" />
								</Row>
								<TableSkeletonContent elements={elements} />
							</Stack>
						))}
					</Stack>
				)}
			</Stack>
		</Root>
	)
}

/**
 * Reserves a table whose page identity has already loaded.
 */
export function TableSkeleton({ elements }: { elements: PageSkeletonElements }) {
	const { Root } = elements
	return (
		<Root label="Loading topics">
			<TableSkeletonContent elements={elements} />
		</Root>
	)
}

// reserve the avatar, name, primary action, and metadata beneath the name
function IdentitySkeleton({ elements: { Stack, Row, Shape } }: { elements: PageSkeletonElements }) {
	return (
		<Stack className="gap-2">
			<Row className="gap-3">
				<Shape className="size-16 shrink-0 rounded-full" />
				<Stack className="min-w-0 flex-1 gap-2">
					<Shape className="h-7 w-3/4" />
				</Stack>
				<Shape className="h-11 w-20 shrink-0 rounded-lg" />
			</Row>
			<Shape className="h-4 w-2/3" />
		</Stack>
	)
}

// keep the shared table's header, five rows, and totals within the card
function TableSkeletonContent({ elements: { Stack, Row, Shape } }: { elements: PageSkeletonElements }) {
	return (
		<Stack className="overflow-hidden rounded-lg border border-separator bg-card shadow-raised">
			<Row className="min-h-12 gap-4 border-b border-separator-strong px-4 py-3">
				<Shape className="h-3 w-1/3" />
				<Shape className="h-3 w-1/4" />
				<Shape className="h-3 w-1/6" />
			</Row>
			{TABLE_ROW_KEYS.map((rowKey, i) => (
				<Row key={rowKey} className="min-h-12 gap-4 border-b border-separator px-4 py-4">
					<Stack className="w-1/3">
						<Shape className={i % 2 === 0 ? "h-4 w-full" : "h-4 w-3/4"} />
					</Stack>
					<Shape className="h-3 w-1/4" />
					<Shape className="h-3 w-1/6" />
				</Row>
			))}
			<Row className="min-h-11 justify-between gap-4 px-4 py-3">
				<Shape className="h-3 w-16" />
				<Shape className="h-3 w-24" />
			</Row>
		</Stack>
	)
}

// reserve the fund title, spend meter, pause checkpoints, daily usage, and plan
function BudgetSkeleton({ elements: { Stack, Row, Shape } }: { elements: PageSkeletonElements }) {
	return (
		<Stack className="gap-4 rounded-lg border border-separator bg-card p-4 shadow-raised">
			<Row className="justify-between gap-4">
				<Shape className="h-5 w-1/2" />
				<Shape className="h-4 w-1/4" />
			</Row>
			<Stack className="gap-3 pt-6">
				<Shape className="h-3 w-full rounded-full" />
				<Shape className="h-3 w-5/6" />
				<Shape className="h-4 w-3/4" />
			</Stack>
			<Stack className="gap-3 py-2">
				{TABLE_ROW_KEYS.map((checkpointKey) => (
					<Row key={checkpointKey} className="gap-4">
						<Shape className="h-3 w-8" />
						<Shape className="h-3 flex-1" />
					</Row>
				))}
			</Stack>
			<Stack className="gap-2">
				<Shape className="h-5 w-28" />
				<Shape className="h-4 w-24" />
			</Stack>
			<Shape className="h-5 w-20" />
		</Stack>
	)
}
