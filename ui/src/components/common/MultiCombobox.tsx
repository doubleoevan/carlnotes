import { Check, ChevronsUpDown, X } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/primitives/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
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
}: {
	options: ComboboxOption[]
	values: string[]
	onUpdateValues: (values: string[]) => void
	placeholder?: string
	emptyLabel?: string
}) {
	const [isOpen, setIsOpen] = useState(false)
	const [filter, setFilter] = useState("")

	// clicking a value option updates the selected values
	const handleUpdateValues = (value: string): void => {
		onUpdateValues(
			values.includes(value) ? values.filter((previousValue) => previousValue !== value) : [...values, value],
		)
	}

	// the options list filters as the filter input is typed into, case-insensitively
	const shownOptions = options.filter((option) => option.label.toLowerCase().includes(filter.trim().toLowerCase()))
	const selectedOptions = options.filter((option) => values.includes(option.value))
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
			<Popover open={isOpen} onOpenChange={setIsOpen}>
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
				<PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-1">
					{/* the filter input, then the rows it leaves */}
					<input
						value={filter}
						onChange={(event) => setFilter(event.target.value)}
						placeholder="Search…"
						aria-label="Filter the list"
						className="placeholder:text-muted-foreground mb-1 w-full bg-transparent px-2 py-1.5 text-sm outline-none"
					/>
					<ul className="max-h-56 overflow-y-auto">
						{shownOptions.map((option) => (
							<li key={option.value}>
								<button
									type="button"
									onClick={() => handleUpdateValues(option.value)}
									className="hover:bg-accent flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm"
								>
									<Check className={cn("size-4 shrink-0", !values.includes(option.value) && "opacity-0")} />
									<span className="truncate">{option.label}</span>
								</button>
							</li>
						))}
					</ul>
					{/* show a message if there are no options left after filtering */}
					{shownOptions.length === 0 && <p className="text-muted-foreground px-2 py-2 text-sm">{emptyLabel}</p>}
				</PopoverContent>
			</Popover>
		</div>
	)
}
