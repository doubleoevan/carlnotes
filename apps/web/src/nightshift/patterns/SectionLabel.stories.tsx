// the section label pattern: the small uppercase display-font label over a value, beside FieldLabel over a field
import { cn } from "@carlnotes/nightshift/classNames"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { FileText } from "lucide-react"
import { useId } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { FieldLabel } from "@/components/common/FieldLabel"
import { Input } from "@/components/primitives/input"
import { InfoSection } from "@/components/topic/TopicInfo"
import { SECTION_LABEL_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

// the kept attachment the centered story's file link downloads, as the Chat files popover links each kept file
const STORY_KEPT_ATTACHMENT_ID = "attachment-llm-tooling-benchmarks"

/**
 * Renders SECTION_LABEL_CLASS over a value, as an info card's section writes it, and FieldLabel over an input beside
 * it, as the topic and team dialogs write it. Centered, the section label heads a list of file links, as the Chat files
 * popover shows it.
 */
function SectionLabelPattern({
	label,
	value,
	fieldLabel,
	fieldValue,
	isRequired,
	isCentered,
}: {
	// the section label and the value under it
	label: string
	value: string
	// the FieldLabel and the text in its input
	fieldLabel: string
	fieldValue: string
	// whether FieldLabel marks its field with a trailing asterisk
	isRequired: boolean
	// whether the section label centers over a list of file links, as the Chat files popover's title does
	isCentered: boolean
}) {
	// the id that ties FieldLabel to its input
	const fieldInputId = useId()

	// the centered section label over a file link row, in the popover's small text
	if (isCentered) {
		return (
			<div className="text-sm" style={{ maxWidth: 280 }}>
				<div className={cn(SECTION_LABEL_CLASS, "mb-1 text-center")}>{label}</div>
				<div className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1">
					<FileText aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
					<AnchorLink
						href={`/api/chat-attachments/${STORY_KEPT_ATTACHMENT_ID}/download`}
						download={value}
						className={cn(STANDALONE_LINK_CLASS, "min-w-0 flex-1 truncate")}
					>
						{value}
					</AnchorLink>
				</div>
			</div>
		)
	}

	return (
		<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, maxWidth: 560 }}>
			{/* the section label over a value, in the info card's small text */}
			<div className="text-sm">
				<InfoSection label={label}>{value}</InfoSection>
			</div>
			{/* FieldLabel over a field. a new key refills the field from the value control */}
			<div>
				<FieldLabel htmlFor={fieldInputId} isRequired={isRequired}>
					{fieldLabel}
				</FieldLabel>
				<Input id={fieldInputId} key={fieldValue} defaultValue={fieldValue} aria-required={isRequired} />
			</div>
		</div>
	)
}

const meta = {
	title: "Patterns/SectionLabel",
	component: SectionLabelPattern,
	args: {
		label: "Frequency",
		value: "Daily at 9:00 AM",
		fieldLabel: "Name",
		fieldValue: "River Lab",
		isRequired: false,
		isCentered: false,
	},
	argTypes: {
		label: { control: "text" },
		value: { control: "text" },
		fieldLabel: { control: "text" },
		fieldValue: { control: "text" },
		isRequired: { control: "boolean" },
		isCentered: { control: "boolean" },
	},
	// the popovers, info cards, and dialogs every section label sits in
	parameters: { surface: "card" },
} satisfies Meta<typeof SectionLabelPattern>

export default meta
type Story = StoryObj<typeof meta>

// the section label over a value, beside FieldLabel over an input
export const Default: Story = {}

// FieldLabel with the asterisk of the required Title field
export const RequiredField: Story = { args: { fieldLabel: "Title", fieldValue: "LLM tooling", isRequired: true } }

// the centered section label the Chat files popover puts over its file links
export const Centered: Story = { args: { label: "Chat files", value: "llm-tooling-benchmarks.pdf", isCentered: true } }

// a label long enough to wrap in its column
export const LongLabel: Story = {
	args: { label: "Cost this month across every scheduled and manual scan", value: "$1.42" },
}
