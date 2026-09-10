import { Bot, EllipsisVertical, Flag } from "lucide-react"
import { useState } from "react"
import { AddToAiDialog } from "@/components/common/AddToAiDialog"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog.tsx"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { MENU_OPTION_CLASS, SEARCH_BAR_ICON_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { usePageActions } from "@/stores/pageActionsStore"

/**
 * The vertical dots menu at the end of the search bar. Each page registers its own options,
 * and a page that registers none shows no menu.
 */
export function PageActionMenu() {
	const pageActions = usePageActions()
	const [isOpen, setIsOpen] = useState(false)
	const [isReporting, setIsReporting] = useState(false)
	const [isAddingToAi, setIsAddingToAi] = useState(false)

	if (!pageActions) {
		return null
	}
	const label = `${pageActions.page} actions`
	// the mcp server the Add to AI dialog offers. the page's own, or the one at /mcp
	const mcpServer = pageActions.mcp ?? { name: "CarlNotes", url: `${window.location.origin}/mcp` }
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
				{/* nothing takes focus on open */}
				<PopoverContent align="end" alignOffset={-9} sideOffset={13} className="w-44" bodyClassName="p-1">
					{pageActions.options?.map((pageAction) => (
						<button
							key={pageAction.label}
							type="button"
							onClick={() => {
								setIsOpen(false)
								pageAction.onSelect()
							}}
							className={MENU_OPTION_CLASS}
						>
							<pageAction.Icon
								className={cn("size-4", pageAction.isActive ? "text-primary fill-current" : "text-muted-foreground")}
							/>
							<span className="flex-1 text-left">{pageAction.label}</span>
						</button>
					))}
					{/* the Add to AI option */}
					<button
						type="button"
						onClick={() => {
							setIsOpen(false)
							setIsAddingToAi(true)
						}}
						className={MENU_OPTION_CLASS}
					>
						<Bot className="text-muted-foreground size-4" />
						<span className="flex-1 text-left">Add to AI</span>
					</button>
					{pageActions.report && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => {
										setIsOpen(false)
										setIsReporting(true)
									}}
									className={MENU_OPTION_CLASS}
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
			{/* the Add to AI dialog mounts only while open. its state resets on each close */}
			{isAddingToAi && <AddToAiDialog mcpServer={mcpServer} onClose={() => setIsAddingToAi(false)} />}
			{/* the report issue dialog mounts only while open. its state resets on each close */}
			{isReporting && pageActions.report && (
				<ReportIssueDialog
					subjectKind={pageActions.report.subjectKind}
					subjectId={pageActions.report.subjectId}
					subjectLabel={pageActions.report.subjectLabel}
					onClose={() => setIsReporting(false)}
				/>
			)}
		</>
	)
}
