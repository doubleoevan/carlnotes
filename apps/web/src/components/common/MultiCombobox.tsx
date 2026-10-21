import { Check, ChevronsUpDown, Plus, X } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/primitives/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { MENU_OPTION_CLASS, MENU_OPTION_SELECTED_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// one choice the combobox offers
export type ComboboxOption = { value: string; label: string }

/**
 * A multi-select combobox: the selected options are removable pills, and the filtered options list is a popover dropdown.
 */
export function MultiCombobox({
	options,
	values,
	onUpdateValues,
	placeholder = "Select a few…",
	emptyLabel = "Nothing to select.",
	newOptionLabel,
	onNewOption,
	pinnedOption,
}: {
	options: ComboboxOption[]
	values: string[]
	onUpdateValues: (values: string[]) => void
	placeholder?: string
	emptyLabel?: string
	// the row under the list that makes an option instead of picking one, left out when nothing handles it
	newOptionLabel?: string
	onNewOption?: () => void
	// an option that sits under the scrolling list instead of in it, so a long list never hides it
	pinnedOption?: ComboboxOption
}) {
	const [isOpen, setIsOpen] = useState(false)
	const [filter, setFilter] = useState("")

	// clicking an option toggles its value in the selection
	const handleUpdateValues = (value: string): void => {
		onUpdateValues(
			values.includes(value) ? values.filter((previousValue) => previousValue !== value) : [...values, value],
		)
	}

	// the options narrowed by the filter text, case-insensitively. the pinned option is never filtered out
	const shownOptions = options.filter((option) => option.label.toLowerCase().includes(filter.trim().toLowerCase()))
	const selectedOptions = [...options, ...(pinnedOption ? [pinnedOption] : [])].filter((option) =>
		values.includes(option.value),
	)
	return (
		<div>
			{/* the selected options as pills, each removable without opening the list */}
			{selectedOptions.length > 0 && (
				<div className="mb-1.5 flex flex-wrap gap-1.5">
					{selectedOptions.map((option) => (
						<Badge key={option.value} variant="secondary" className="gap-1">
							{option.label}
							<button
								type="button"
								aria-label={`Remove ${option.label}`}
								onClick={() => handleUpdateValues(option.value)}
							>
								<X className="size-3" />
							</button>
						</Badge>
					))}
				</div>
			)}
			{/* modal so the popover brings its own scroll lock. inside a dialog, the dialog's lock blocks touchmove
		        on everything portalled outside it, which leaves the list unscrollable on a phone */}
			<Popover open={isOpen} onOpenChange={setIsOpen} modal>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="border-input bg-background flex min-h-9 w-full items-center justify-between rounded-md border px-3 text-sm"
					>
						<span className={cn(selectedOptions.length === 0 && "text-muted-foreground")}>
							{selectedOptions.length === 0 ? placeholder : `${selectedOptions.length} selected`}
						</span>
						<ChevronsUpDown className="size-4 shrink-0 opacity-50" />
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-(--radix-popover-trigger-width)" bodyClassName="p-1">
					{/* the filter input, then the rows it leaves. the popover does not move focus when it opens */}
					<input
						// biome-ignore lint/a11y/noAutofocus: this field is why the panel opens
						autoFocus
						value={filter}
						onChange={(event) => setFilter(event.target.value)}
						placeholder="Search…"
						aria-label="Filter the list"
						className="placeholder:text-muted-foreground mb-1 w-full bg-transparent px-2 py-1.5 text-sm outline-none"
					/>
					<div className="max-h-56 overflow-y-auto">
						{/* a selected row is highlighted, with its check on the right */}
						{shownOptions.map((option) => (
							<button
								key={option.value}
								type="button"
								onClick={() => handleUpdateValues(option.value)}
								className={cn(MENU_OPTION_CLASS, values.includes(option.value) && MENU_OPTION_SELECTED_CLASS)}
							>
								<span className="min-w-0 flex-1 truncate">{option.label}</span>
								{values.includes(option.value) && <Check className="text-primary size-4 shrink-0" />}
							</button>
						))}
					</div>
					{/* show a message if there are no options left after filtering */}
					{shownOptions.length === 0 && <p className="text-muted-foreground px-2 py-2 text-sm">{emptyLabel}</p>}
					{/* the pinned option toggles like any other row, from under the list where it always shows */}
					{pinnedOption && (
						<button
							type="button"
							onClick={() => handleUpdateValues(pinnedOption.value)}
							className={cn(
								MENU_OPTION_CLASS,
								"text-link",
								values.includes(pinnedOption.value) && MENU_OPTION_SELECTED_CLASS,
							)}
						>
							<Plus className="size-4 shrink-0" />
							<span className="min-w-0 flex-1 truncate">{pinnedOption.label}</span>
							{values.includes(pinnedOption.value) && <Check className="text-primary size-4 shrink-0" />}
						</button>
					)}
					{/* the new-option row completes the list, allowing the caller to click it */}
					{onNewOption && (
						<button
							type="button"
							onClick={() => {
								setIsOpen(false)
								onNewOption()
							}}
							className={cn(MENU_OPTION_CLASS, "text-link")}
						>
							<Plus className="size-4 shrink-0" />
							{newOptionLabel ?? "New"}
						</button>
					)}
				</PopoverContent>
			</Popover>
		</div>
	)
}
