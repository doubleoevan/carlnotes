import { PageActionMenu as SharedPageActionMenu } from "@carlnotes/core/components/PageActionMenu"
import { cn } from "@carlnotes/nightshift/classNames"
import { Bot, EllipsisVertical, Flag, Plus } from "lucide-react"
import { useState } from "react"
import { AddToAiDialog } from "@/components/common/AddToAiDialog"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog.tsx"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { useOrigin } from "@/hooks/useBrowserValue"
import { MENU_OPTION_CLASS, SEARCH_BAR_ICON_CLASS } from "@/lib/styleClasses"
import { type PageActionOption, type PageActions, usePageActions } from "@/stores/pageActionsStore"

// what the menu offers on a page that registers no actions
const DEFAULT_PAGE_ACTIONS: PageActions = { page: "Page" }

/**
 * The search bar's vertical dots menu, with the page's options, New topic, Add to AI, and Report issue.
 */
export function PageActionMenu() {
	// the page's actions, which menu or dialog is open, the new topic dialog, and this site's origin
	const pageActions = usePageActions() ?? DEFAULT_PAGE_ACTIONS
	const [isOpen, setIsOpen] = useState(false)
	const [isReporting, setIsReporting] = useState(false)
	const [isAddingToAi, setIsAddingToAi] = useState(false)
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()
	const origin = useOrigin()

	const label = `${pageActions.page} actions`
	// the mcp server the Add to AI dialog offers on every page
	const mcpServer = { name: "CarlNotes", url: `${origin}/mcp` }
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
					<SharedPageActionMenu
						options={pageActions.options}
						hasNewTopicButton={pageActions.hasNewTopicButton}
						icons={{ Plus, Bot, Flag }}
						onNewTopic={openNewTopicDialog}
						onAddToAi={() => setIsAddingToAi(true)}
						onReport={pageActions.report ? () => setIsReporting(true) : undefined}
						onClose={() => setIsOpen(false)}
						Option={PageAction}
					/>
				</PopoverContent>
			</Popover>
			{/* the new topic dialog that the New topic option opens */}
			{newTopicDialog}
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

// keep row styling in the DOM adapter while the core component owns ordering
function PageAction({ label, Icon, isActive, isDisabled, onSelect }: PageActionOption) {
	return (
		<button type="button" onClick={onSelect} disabled={isDisabled} className={MENU_OPTION_CLASS}>
			<Icon className={cn("size-4", isActive ? "text-primary fill-current" : "text-muted-foreground")} />
			<span className="flex-1 text-left">{label}</span>
		</button>
	)
}
