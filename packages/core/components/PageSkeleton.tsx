import type { ComponentType, ReactNode } from "react"
import { TEAM_SECTION_VALUES } from "../lib/cardSections"
import type { TopicPostPageElements } from "./TopicPostPage"

// the portable elements shared by the browser and native renderers
type Container = ComponentType<{ children: ReactNode; className?: string }>
export type PageSkeletonElements = {
	Root: ComponentType<{ children: ReactNode; label: string }>
	Stack: Container
	Row: Container
	Shape: ComponentType<{ className: string }>
	// the page's top row of buttons, in the loaded page's own row
	ButtonRow: Container
	// one open section of the page's accordion, with a placeholder for its title and its count. a flush section
	// is the first of an accordion whose first title drops its top padding, and a section says if it holds cards
	Section: ComponentType<{ children: ReactNode; isFlush?: boolean; hasCards?: boolean }>
	// the raised card a table, the budget, or a Topic Post's body sits in
	Card: Container
	// the news card while its first page loads
	News: ComponentType
	// one row of cards while a card section loads
	CardsRow: ComponentType
	// a page header's image at its frame, and the lines of its title in the title's place
	HeaderImage: ComponentType
	HeaderTitle: ComponentType
}

// the loaded Topic Post page's own header, byline row, and discussion card, which its loading state is laid out in
type TopicPostSkeletonPageElements = Pick<TopicPostPageElements, "Header" | "BylineRow"> & {
	discussionElements: Pick<TopicPostPageElements["discussionElements"], "Card" | "Row">
}

// the page a loading state reserves. the account names whether its budget lists monthly budget cutoffs, and a Topic
// Post's page brings its own layout elements
export type PageSkeletonProps =
	| { kind: "profile" | "teams" | "activity" | "team" }
	| { kind: "account"; hasMonthlyBudgetCutoffs: boolean }
	| { kind: "topicPost"; pageElements: TopicPostSkeletonPageElements }

// the card sections each page opens over its tables: a profile's first, and a team's topics, films, podcast episodes,
// and Topic Posts
const PAGE_CARD_SECTIONS: Record<"profile" | "teams" | "activity" | "team", string[]> = {
	profile: ["topics"],
	teams: [],
	activity: [],
	team: TEAM_SECTION_VALUES,
}

// the table sections each page opens under its cards
const PAGE_SECTIONS: Record<"profile" | "teams" | "activity" | "team", string[]> = {
	profile: ["topics", "teams"],
	teams: ["teams"],
	activity: ["subscriptions", "invitations"],
	team: ["members", "topics", "notes"],
}

// the rows a table, a Topic Post's body, and the budget's cutoff list reserve
const TABLE_ROW_KEYS = ["first", "second", "third", "fourth", "fifth"]
const BODY_LINE_KEYS = ["first", "second", "third", "fourth", "fifth", "sixth"]
const CUTOFF_ROW_KEYS = ["first", "second", "third", "fourth", "fifth"]

// the daily scans card's two meters, the scans used and the day's reset
const METER_KEYS = ["dailyScans", "dayReset"]

/**
 * Reserves each page's buttons, identity, news, cards, tables, or budget in the loaded page's own layout elements.
 */
export function PageSkeleton({ elements, ...props }: PageSkeletonProps & { elements: PageSkeletonElements }) {
	// a Topic Post's page and the account's budget have layouts of their own
	const { Root, Stack } = elements
	if (props.kind === "topicPost") {
		return (
			<Root label="Loading post">
				<TopicPostSkeleton elements={elements} pageElements={props.pageElements} />
			</Root>
		)
	}
	if (props.kind === "account") {
		return (
			<Root label="Loading account">
				<BudgetSkeleton elements={elements} hasMonthlyBudgetCutoffs={props.hasMonthlyBudgetCutoffs} />
			</Root>
		)
	}

	// a profile and a team load their buttons and their identity with their sections
	const { kind } = props
	const hasIdentity = kind === "profile" || kind === "team"
	const { News } = elements
	return (
		<Root label={`Loading ${kind}`}>
			{hasIdentity && <ActionsSkeleton elements={elements} />}
			{hasIdentity && <IdentitySkeleton elements={elements} hasWrappedSummary={kind === "profile"} />}
			{/* a profile's news comes first, and its sections follow the news as a team's follow its header */}
			<Stack className={kind === "profile" ? "mt-4" : kind === "team" ? "mt-2" : undefined}>
				{kind === "profile" && <News />}
				<Stack className={kind === "profile" ? "mt-4" : undefined}>
					{PAGE_CARD_SECTIONS[kind].map((sectionKey) => (
						<CardsSectionSkeleton key={sectionKey} elements={elements} isFlush={kind === "profile"} />
					))}
					{PAGE_SECTIONS[kind].map((sectionKey) => (
						<TableSectionSkeleton key={sectionKey} elements={elements} />
					))}
				</Stack>
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

// reserve the page's two buttons in its own row, the plain one at the left and the highlighted one at the right
function ActionsSkeleton({ elements: { ButtonRow, Shape } }: { elements: PageSkeletonElements }) {
	return (
		<ButtonRow>
			<Shape className="h-9 w-28 rounded-md" />
			<Shape className="h-9 w-28 rounded-md" />
		</ButtonRow>
	)
}

// reserve the avatar at the height of a topic's image, with the name's line over the summary line beside it, at the
// loaded header's top padding. a profile's summary line wraps onto a second line on a phone
function IdentitySkeleton({
	elements: { Stack, Row, Shape },
	hasWrappedSummary,
}: {
	elements: PageSkeletonElements
	hasWrappedSummary: boolean
}) {
	return (
		<Row className="items-start gap-4">
			<Shape className="size-20 shrink-0 rounded-full sm:size-24" />
			<Stack className="min-w-0 flex-1 pt-2 sm:pt-5">
				<Row className="h-8">
					<Shape className="h-6 w-48 max-w-full" />
				</Row>
				<Row className="mt-1 h-5">
					<Shape className="h-3.5 w-64 max-w-full" />
				</Row>
				{hasWrappedSummary && (
					<Row className="h-5 sm:hidden">
						<Shape className="h-3.5 w-40 max-w-full" />
					</Row>
				)}
			</Stack>
		</Row>
	)
}

// reserve one section of cards: its title over one row of cards
function CardsSectionSkeleton({ elements, isFlush }: { elements: PageSkeletonElements; isFlush: boolean }) {
	const { Section, CardsRow } = elements
	return (
		<Section isFlush={isFlush} hasCards>
			<CardsRow />
		</Section>
	)
}

// reserve one section of a table: its title over the table's card
function TableSectionSkeleton({ elements }: { elements: PageSkeletonElements }) {
	const { Section } = elements
	return (
		<Section>
			<TableSkeletonContent elements={elements} />
		</Section>
	)
}

// reserve a Topic Post's page in its own header: its image beside its title, its byline with the reactions after it,
// and its details line, then its discussion's card and its body's card
function TopicPostSkeleton({
	elements: { Stack, Row, Shape, Card, HeaderImage, HeaderTitle },
	pageElements: { Header, BylineRow, discussionElements },
}: {
	elements: PageSkeletonElements
	pageElements: TopicPostSkeletonPageElements
}) {
	return (
		<>
			<Header image={<HeaderImage />} title={<HeaderTitle />}>
				{/* the byline, which wraps onto a second line on a phone, and the reactions after it */}
				<BylineRow>
					<Stack className="w-full sm:w-auto">
						<Row className="h-6 gap-2">
							<Shape className="size-6 shrink-0 rounded-full" />
							<Shape className="h-3.5 w-28" />
						</Row>
						<Row className="h-5 sm:hidden">
							<Shape className="h-3.5 w-44" />
						</Row>
					</Stack>
					<Row className="h-8">
						<Shape className="h-5 w-36" />
					</Row>
				</BylineRow>
				{/* the details line */}
				<Row className="mt-1 h-5">
					<Shape className="h-3 w-56 max-w-full" />
				</Row>
			</Header>
			{/* the discussion's card: the play button beside its name and its line, which wraps on a phone */}
			<discussionElements.Card>
				<discussionElements.Row>
					<Shape className="size-11 shrink-0 rounded-full" />
					<Stack className="min-w-0 grow basis-52">
						<Row className="h-[23px]">
							<Shape className="h-4 w-48 max-w-full" />
						</Row>
						<Row className="h-5">
							<Shape className="h-3 w-40 max-w-full" />
						</Row>
						<Row className="h-5 sm:hidden">
							<Shape className="h-3 w-24" />
						</Row>
					</Stack>
				</discussionElements.Row>
			</discussionElements.Card>
			{/* the body's card */}
			<Card className="my-4 gap-3">
				{BODY_LINE_KEYS.map((lineKey, i) => (
					<Shape key={lineKey} className={i === BODY_LINE_KEYS.length - 1 ? "h-4 w-2/3" : "h-4 w-full"} />
				))}
			</Card>
		</>
	)
}

// keep the table's header, five rows, and the line under them within the table's own card
function TableSkeletonContent({ elements: { Stack, Row, Shape, Card } }: { elements: PageSkeletonElements }) {
	return (
		<Card className="mb-4">
			<Row className="h-9 gap-4 border-b border-separator-strong">
				<Shape className="h-3 w-1/3" />
				<Shape className="h-3 w-1/4" />
				<Shape className="h-3 w-1/6" />
			</Row>
			{TABLE_ROW_KEYS.map((rowKey, i) => (
				<Row key={rowKey} className="h-[53px] gap-4 border-b border-separator">
					<Stack className="w-1/3">
						<Shape className={i % 2 === 0 ? "h-4 w-full" : "h-4 w-3/4"} />
					</Stack>
					<Shape className="h-3 w-1/4" />
					<Shape className="h-3 w-1/6" />
				</Row>
			))}
			<Row className="mt-2 h-6 justify-between gap-4">
				<Shape className="h-3 w-16" />
				<Shape className="h-3 w-24" />
			</Row>
		</Card>
	)
}

// reserve the budget as the loaded budget lays it out. the coffee fund card holds its title, reset clock, and amount,
// the bar, its legend, the status line, and the cutoff list if the budget has cutoffs. the daily scans card holds its
// title and its two meters. each card ends with the plan and its button
function BudgetSkeleton({
	elements,
	hasMonthlyBudgetCutoffs,
}: {
	elements: PageSkeletonElements
	hasMonthlyBudgetCutoffs: boolean
}) {
	const { Stack, Row, Shape, Card } = elements
	return (
		<Stack className="gap-6">
			{/* the coffee fund card with its title, reset clock, and amount at the top */}
			<Card className="gap-4">
				<CardTopRowSkeleton elements={elements} />
				<Stack>
					{/* the bar, under the cutoff circles if the budget has cutoffs */}
					<Stack className={hasMonthlyBudgetCutoffs ? "mt-2 pt-7.5" : "mt-2"}>
						<Shape className="h-3 w-full rounded-full" />
					</Stack>
					{/* the legend, which wraps onto a second line on a phone */}
					<Row className="mt-2 flex-wrap gap-x-4 gap-y-1">
						<Row className="h-4">
							<Shape className="h-3 w-28" />
						</Row>
						<Row className="h-4">
							<Shape className="h-3 w-28" />
						</Row>
						<Row className="h-4">
							<Shape className="h-3 w-28" />
						</Row>
					</Row>
					{/* the status line */}
					<Row className="mt-1 h-5">
						<Shape className="h-3 w-40" />
					</Row>
					{/* what each cutoff stops. the first and the third line wrap on a phone */}
					{hasMonthlyBudgetCutoffs && (
						<Stack className="mt-3 gap-1">
							{CUTOFF_ROW_KEYS.map((cutoffKey, i) => (
								<Row key={cutoffKey} className={i % 2 === 0 && i < 4 ? "h-8 gap-2 sm:h-4" : "h-4 gap-2"}>
									<Shape className="h-3 w-8" />
									<Shape className="h-3 flex-1" />
								</Row>
							))}
						</Stack>
					)}
				</Stack>
				<PlanRowSkeleton elements={elements} />
			</Card>
			{/* the daily scans card with its title, the scans used beside the reset clock, and the plan */}
			<Card className="gap-4">
				<CardTopSkeleton elements={elements} />
				<PlanRowSkeleton elements={elements} />
			</Card>
		</Stack>
	)
}

// reserve the plan line at a card's bottom left with its button right after it
function PlanRowSkeleton({ elements: { Row, Shape } }: { elements: PageSkeletonElements }) {
	return (
		<Row className="gap-3">
			<Shape className="h-3.5 w-24" />
			<Shape className="h-9 w-32 rounded-md" />
		</Row>
	)
}

// reserve the coffee fund card's title at the top left, its reset clock's ring over its caption at the top center, and
// the amount at the top right, on every width
function CardTopRowSkeleton({ elements: { Stack, Row, Shape } }: { elements: PageSkeletonElements }) {
	return (
		<Row className="items-start gap-3">
			<Stack className="flex-1">
				<Shape className="h-4 w-24" />
			</Stack>
			<Stack className="items-center gap-1.5">
				<Shape className="size-22 rounded-full" />
				<Shape className="h-3 w-28" />
			</Stack>
			<Stack className="flex-1 items-end">
				<Shape className="h-3.5 w-24" />
			</Stack>
		</Row>
	)
}

// reserve a card's title at the top left and its meters at the top center, each ring over its caption. below the
// phone breakpoint the title sits over the meters
function CardTopSkeleton({ elements: { Stack, Row, Shape } }: { elements: PageSkeletonElements }) {
	return (
		<Stack className="gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-start">
			<Row className="h-6">
				<Shape className="h-4 w-24" />
			</Row>
			<Row className="items-start justify-center gap-8">
				{METER_KEYS.map((meterKey) => (
					<Stack key={meterKey} className="items-center gap-1.5">
						<Shape className="size-22 rounded-full" />
						<Shape className="h-3 w-28" />
					</Stack>
				))}
			</Row>
		</Stack>
	)
}
