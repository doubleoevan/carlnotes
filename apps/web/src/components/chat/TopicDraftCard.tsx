import { toTopicPath } from "@carlnotes/contracts/seo"
import {
	TopicDraftCard as SharedTopicDraftCard,
	type TopicDraftCardElements,
	type TopicDraftCardProps,
} from "@carlnotes/core/components/TopicDraftCard"
import { X } from "lucide-react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ScrollBox } from "@/components/common/ScrollBox"
import { POPOVER_HEADING_CLASS, SECTION_LABEL_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

/**
 * Adapts the shared Topic draft card to browser elements.
 */
export function TopicDraftCard(props: TopicDraftCardProps) {
	return <SharedTopicDraftCard {...props} elements={topicDraftCardElements} />
}

// keep topic draft elements stable through streamed proposals
const topicDraftCardElements: TopicDraftCardElements = {
	Frame: ({ children, heading }) => (
		<section className="flex min-h-0 shrink flex-col border-t px-3 py-2 text-sm" aria-label={heading}>
			{children}
		</section>
	),
	Scroll: ({ children, topicDraft }) => (
		<ScrollBox
			scrollToTopOn={topicDraft}
			boxClassName="flex min-h-0 flex-col"
			className="max-h-48 min-h-0 overscroll-contain sm:max-h-72"
		>
			{children}
		</ScrollBox>
	),
	HeadingRow: ({ children }) => <div className="relative">{children}</div>,
	Heading: ({ children }) => <h2 className={POPOVER_HEADING_CLASS}>{children}</h2>,
	Dismiss: ({ onDismiss }) => (
		<button
			type="button"
			aria-label="Dismiss proposed edit"
			onClick={onDismiss}
			className="text-muted-foreground hover:text-foreground absolute top-0 right-0"
		>
			<X className="size-3.5" />
		</button>
	),
	Loading: () => <CoffeeLoading className="min-h-24 text-base" />,
	Name: ({ name, topicId }) => (
		<p className="text-foreground animate-in fade-in mb-2 break-words duration-500">
			{topicId ? (
				<AnchorLink href={toTopicPath({ id: topicId, name })} className={STANDALONE_LINK_CLASS}>
					{name}
				</AnchorLink>
			) : (
				name
			)}
		</p>
	),
	Fields: ({ children }) => <dl>{children}</dl>,
	Field: ({ label, fieldText, children }) => (
		<div className="py-1.5 first:pt-0 last:pb-0">
			<dt className={SECTION_LABEL_CLASS}>{label}</dt>
			<dd key={fieldText} className="text-foreground animate-in fade-in mt-1 min-w-0 break-words duration-500">
				{children}
			</dd>
		</div>
	),
	List: ({ items, isNumbered }) => {
		// render the ordered or unordered topic field entries
		const List = isNumbered ? "ol" : "ul"
		return (
			<List className={isNumbered ? "list-decimal space-y-0.5 pl-5" : "grid gap-0.5"}>
				{items.map((item, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: a draft replaces the whole ordered list
					<li key={`${index}-${item}`}>{item}</li>
				))}
			</List>
		)
	},
	Files: ({ files, onRemove }) => (
		<ul className="flex flex-wrap gap-1">
			{files.map((file, index) => (
				<li
					key={`${file.name}-${file.size}-${file.lastModified}`}
					className="bg-muted flex items-center gap-1 rounded px-2 py-0.5 text-xs"
				>
					{file.name}
					{onRemove && (
						<button
							type="button"
							aria-label={`Remove ${file.name}`}
							onClick={() => onRemove(index)}
							className="hover:text-foreground"
						>
							<X className="size-3" />
						</button>
					)}
				</li>
			))}
		</ul>
	),
}
