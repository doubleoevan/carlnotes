import {
	type PageSkeletonElements,
	type PageSkeletonProps,
	PageSkeleton as SharedPageSkeleton,
	TableSkeleton as SharedTableSkeleton,
} from "@carlnotes/core/components/PageSkeleton"
import { cn } from "@carlnotes/nightshift/classNames"
import { AccordionSection } from "@/components/common/AccordionSection"
import { CardsRowSkeleton } from "@/components/common/CardsSection"
import { Accordion } from "@/components/primitives/accordion"
import { NEWS_LIST_ELEMENTS } from "@/components/social/NewsList"
import {
	CARD_CLASS,
	FLUSH_FIRST_SECTION_CLASS,
	HEADER_TOPIC_IMAGE_CLASS,
	NEWS_HEADING_ROW_CLASS,
	PAGE_BUTTON_ROW_CLASS,
	SKELETON_SHAPE_CLASS,
	TOPIC_HEADER_AREA_CLASSES,
} from "@/lib/styleClasses"

/**
 * Draws the shared page loading layout with the loaded pages' own rows, sections, and cards.
 */
export function PageSkeleton(props: PageSkeletonProps) {
	return <SharedPageSkeleton {...props} elements={PAGE_SKELETON_ELEMENTS} />
}

/**
 * Reserves topics while the rest of a profile is already visible.
 */
export function TableSkeleton() {
	return <SharedTableSkeleton elements={PAGE_SKELETON_ELEMENTS} />
}

// the one section of the accordion each placeholder section opens in
const SECTION_VALUE = "section"

// one placeholder for each of the news card's three window choices
const WINDOW_OPTION_KEYS = ["week", "day", "hour"]

// the news card before the page knows whose news it shows: the news list's own card, its heading row with the title
// and the window choices, and the list's own loading rows
function NewsListSkeleton() {
	const { Card, Loading } = NEWS_LIST_ELEMENTS
	return (
		<Card>
			<div className={cn(NEWS_HEADING_ROW_CLASS, "mb-4")}>
				{/* the caret and the title on the title's own line */}
				<div className="flex h-7 items-center gap-2">
					<div className={cn(SKELETON_SHAPE_CLASS, "size-4")} />
					<div className={cn(SKELETON_SHAPE_CLASS, "h-5 w-36")} />
				</div>
				{/* the window choices */}
				<div className="flex shrink-0 items-center gap-1">
					{WINDOW_OPTION_KEYS.map((windowOptionKey) => (
						<div key={windowOptionKey} className={cn(SKELETON_SHAPE_CLASS, "h-8 w-14 rounded-md")} />
					))}
				</div>
			</div>
			<Loading />
		</Card>
	)
}

// announce one loading state, hide its placeholders from assistive technology, and lay each part out in the classes
// and components its loaded page uses
const PAGE_SKELETON_ELEMENTS: PageSkeletonElements = {
	Root: ({ label, children }) => (
		<div role="status" aria-label={label} aria-busy="true">
			<div aria-hidden="true">{children}</div>
		</div>
	),
	Stack: ({ className, children }) => <div className={cn("flex flex-col", className)}>{children}</div>,
	Row: ({ className, children }) => <div className={cn("flex items-center", className)}>{children}</div>,
	Shape: ({ className }) => <div className={cn(SKELETON_SHAPE_CLASS, className)} />,
	ButtonRow: ({ children }) => <div className={PAGE_BUTTON_ROW_CLASS}>{children}</div>,
	// the page's own accordion section, open, with its title and count as placeholders
	Section: ({ isFlush, children }) => (
		<Accordion type="multiple" value={[SECTION_VALUE]} className={cn(isFlush && FLUSH_FIRST_SECTION_CLASS)}>
			<AccordionSection value={SECTION_VALUE} title="" isLoading>
				{children}
			</AccordionSection>
		</Accordion>
	),
	Card: ({ className, children }) => <div className={cn(CARD_CLASS, "flex flex-col", className)}>{children}</div>,
	News: NewsListSkeleton,
	CardsRow: CardsRowSkeleton,
	// the header image's frame in the topic header's image area
	HeaderImage: () => (
		<div
			className={cn(SKELETON_SHAPE_CLASS, TOPIC_HEADER_AREA_CLASSES.image, "aspect-[3/2]", HEADER_TOPIC_IMAGE_CLASS)}
		/>
	),
	// the title's lines in the topic header's title area: one line from sm up, and two beside the image on a phone
	HeaderTitle: () => (
		<div className={TOPIC_HEADER_AREA_CLASSES.title}>
			<div className="flex h-[30px] items-center sm:h-[37.5px]">
				<div className={cn(SKELETON_SHAPE_CLASS, "h-6 w-96 max-w-full sm:h-7")} />
			</div>
			<div className="flex h-[30px] items-center sm:hidden">
				<div className={cn(SKELETON_SHAPE_CLASS, "h-6 w-2/3")} />
			</div>
		</div>
	),
}
