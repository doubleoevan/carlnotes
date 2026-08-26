import { EllipsisVertical, Flag } from "lucide-react"
import { useState } from "react"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog.tsx"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SEARCH_BAR_ICON_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { usePageActions } from "@/stores/pageActionsStore"

// one row in the dropdown menu
const ACTION_OPTION_CLASS =
	"hover:bg-accent flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm disabled:pointer-events-none disabled:opacity-50 sm:min-h-9"

/**
 * The vertical dots menu at the end of the search bar. Each page registers its own options,
 * and a page that registers none shows no menu.
 */
export function PageActionMenu() {
	const pageActions = usePageActions()
	const [isOpen, setIsOpen] = useState(false)
	const [isFlagging, setIsFlagging] = useState(false)

	if (!pageActions) {
		return null
	}
	const label = `${pageActions.page} actions`
	return (
		<>
			<Popover open={isOpen} onOpenChange={setIsOpen}>
				<Tooltip>
					{/* the span keeps the tooltip and the popover from both controlling the trigger's state */}
					<TooltipTrigger asChild>
						<span className="inline-flex">
							<PopoverTrigger className={SEARCH_BAR_ICON_CLASS} aria-label={label}>
								<EllipsisVertical className="size-4" />
							</PopoverTrigger>
						</span>
					</TooltipTrigger>
					<TooltipContent>{label}</TooltipContent>
				</Tooltip>
				{/* nothing takes focus on open, so no option starts with the browser's focus ring */}
				<PopoverContent
					align="end"
					alignOffset={-9}
					sideOffset={13}
					className="w-44 p-1"
					onOpenAutoFocus={(event) => event.preventDefault()}
				>
					{pageActions.options?.map((pageAction) => (
						<button
							key={pageAction.label}
							type="button"
							onClick={() => {
								setIsOpen(false)
								pageAction.onSelect()
							}}
							className={ACTION_OPTION_CLASS}
						>
							<pageAction.Icon
								className={cn("size-4", pageAction.isActive ? "text-primary fill-current" : "text-muted-foreground")}
							/>
							<span className="flex-1 text-left">{pageAction.label}</span>
						</button>
					))}
					{pageActions.report && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => {
										setIsOpen(false)
										setIsFlagging(true)
									}}
									className={ACTION_OPTION_CLASS}
								>
									<Flag className="text-muted-foreground size-4" />
									<span className="flex-1 text-left">Report issue</span>
								</button>
							</TooltipTrigger>
							<TooltipContent>
								Report an issue with <span className="font-semibold">{pageActions.report.subjectLabel}</span>
							</TooltipContent>
						</Tooltip>
					)}
				</PopoverContent>
			</Popover>
			{/* the flag issue dialog is only mounted while open, so its state resets each time */}
			{isFlagging && pageActions.report && (
				<ReportIssueDialog
					subjectKind={pageActions.report.subjectKind}
					subjectId={pageActions.report.subjectId}
					subjectLabel={pageActions.report.subjectLabel}
					onClose={() => setIsFlagging(false)}
				/>
			)}
		</>
	)
}
