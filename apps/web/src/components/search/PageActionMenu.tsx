import { isImageReportSubjectKind } from "@carlnotes/contracts/reports"
import { PageActionMenu as SharedPageActionMenu } from "@carlnotes/core/components/PageActionMenu"
import { useSubjectReportFlag } from "@carlnotes/core/hooks/useSubjectReport"
import { toCarlNotesMcpServer } from "@carlnotes/core/lib/installDeeplinks"
import { cn } from "@carlnotes/nightshift/classNames"
import { Bot, EllipsisVertical, Flag, Plus } from "lucide-react"
import { useState } from "react"
import { AddToAiDialog } from "@/components/common/AddToAiDialog"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog.tsx"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { useOrigin } from "@/hooks/useBrowserValue"
import { ACTIVE_ICON_CLASS, MENU_OPTION_CLASS, SEARCH_BAR_ICON_CLASS } from "@/lib/styleClasses"
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
	const [isAddingToAi, setIsAddingToAi] = useState(false)
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()
	const origin = useOrigin()
	// whether the user reported this page's subject, read before the menu opens so its flag is right on the first press
	const reportFlag = useSubjectReportFlag(pageActions.report)

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
				{/* nothing takes focus on open */}
				<PopoverContent align="end" alignOffset={-9} sideOffset={13} className="w-44" bodyClassName="p-1">
					<SharedPageActionMenu
						options={pageActions.options}
						hasNewTopicButton={pageActions.hasNewTopicButton}
						icons={{ Plus, Bot, Flag }}
						onNewTopic={openNewTopicDialog}
						onAddToAi={() => setIsAddingToAi(true)}
						onReport={pageActions.report ? reportFlag.press : undefined}
						isReported={reportFlag.isReported}
						isImageReport={pageActions.report ? isImageReportSubjectKind(pageActions.report.subjectKind) : false}
						onClose={() => setIsOpen(false)}
						Option={PageAction}
					/>
				</PopoverContent>
			</Popover>
			{/* the new topic dialog that the New topic option opens */}
			{newTopicDialog}
			{/* the Add to AI dialog mounts only while open. its state resets on each close */}
			{isAddingToAi && (
				<AddToAiDialog mcpServer={toCarlNotesMcpServer(origin)} onClose={() => setIsAddingToAi(false)} />
			)}
			{/* the report issue dialog mounts only while open. its state resets on each close */}
			{reportFlag.isReporting && pageActions.report && (
				<ReportIssueDialog {...pageActions.report} onClose={reportFlag.closeReport} />
			)}
		</>
	)
}

// keep row styling in the DOM adapter while the core component owns ordering
function PageAction({ label, Icon, isActive, isDisabled, disabledReason, onSelect }: PageActionOption) {
	const option = (
		<button type="button" onClick={onSelect} disabled={isDisabled} className={MENU_OPTION_CLASS}>
			<Icon className={cn("size-4", isActive ? ACTIVE_ICON_CLASS : "text-muted-foreground")} />
			<span className="flex-1 text-left">{label}</span>
		</button>
	)
	if (!isDisabled || !disabledReason) {
		return option
	}

	// a disabled button takes no hover, so the tooltip hangs on a wrapper a keyboard reaches
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{/* biome-ignore lint/a11y/noNoninteractiveTabindex: the wrapper takes focus so the tooltip reads on a keyboard */}
				<span tabIndex={0} className="block">
					{option}
				</span>
			</TooltipTrigger>
			<TooltipContent side="left" className="max-w-60">
				{disabledReason}
			</TooltipContent>
		</Tooltip>
	)
}
