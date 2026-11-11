import { authClient } from "@carlnotes/client/authClient"
import { isImageReportSubjectKind } from "@carlnotes/contracts/reports"
import { SITE_URL } from "@carlnotes/contracts/site"
import {
	PageActionMenu as SharedPageActionMenu,
	type PageActionOption as SharedPageActionOption,
} from "@carlnotes/core/components/PageActionMenu"
import { useSubjectReportFlag } from "@carlnotes/core/hooks/useSubjectReport"
import { toCarlNotesMcpServer } from "@carlnotes/core/lib/installDeeplinks"
import { cn } from "@carlnotes/nightshift/classNames"
import { Bot, EllipsisVertical, Flag, type LucideIcon, Plus } from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import { Alert, type View } from "react-native"
import { toActiveIconProps } from "@/activeIconProps"
import { AddToAiDialog } from "@/components/common/AddToAiDialog"
import { ReportIssueDialog, type ReportSubject } from "@/components/common/ReportIssueDialog"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { useNewTopicDialog } from "@/components/topic/TopicHomeActions"

export type PageActionOption = Omit<SharedPageActionOption<LucideIcon>, "Icon"> & { icon: LucideIcon }

/**
 * Adapts the shared page menu to a native sheet with matching global actions and icons.
 */
export function PageActionMenu({
	page,
	options = [],
	report,
	hasNewTopicButton,
}: {
	page: string
	options?: PageActionOption[]
	report?: ReportSubject
	hasNewTopicButton?: boolean
}) {
	// each form survives the action sheet closing and returns focus to the same trigger
	const [isOpen, setIsOpen] = useState(false)
	const [isAddingToAi, setIsAddingToAi] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()
	const { data: session } = authClient().useSession()
	// whether the user reported this page's subject, read before the sheet opens so its flag is right on the first press
	const reportFlag = useSubjectReportFlag(report)
	return (
		<>
			{/* the shared action list uses the same order and visibility as web */}
			<Button
				ref={triggerRef}
				variant="ghost"
				size="icon"
				accessibilityLabel={`${page} actions`}
				onPress={() => setIsOpen(true)}
			>
				<Icon as={EllipsisVertical} className="size-4 text-muted-foreground" />
			</Button>
			{isOpen && (
				<Sheet title={`${page} actions`} triggerRef={triggerRef} onClose={() => setIsOpen(false)}>
					<SharedPageActionMenu
						options={options.map(({ icon, ...option }) => ({ ...option, Icon: icon }))}
						hasNewTopicButton={hasNewTopicButton}
						icons={{ Plus, Bot, Flag }}
						onNewTopic={openNewTopicDialog}
						onAddToAi={() => setIsAddingToAi(true)}
						onReport={report && session ? reportFlag.press : undefined}
						isReported={reportFlag.isReported}
						isImageReport={report ? isImageReportSubjectKind(report.subjectKind) : false}
						onClose={() => setIsOpen(false)}
						Option={PageAction}
					/>
				</Sheet>
			)}
			{/* reuse the same native forms wherever a global action is offered */}
			{newTopicDialog}
			{isAddingToAi && (
				<AddToAiDialog mcpServer={toCarlNotesMcpServer(SITE_URL)} onClose={() => setIsAddingToAi(false)} />
			)}
			{reportFlag.isReporting && report && <ReportIssueDialog {...report} onClose={reportFlag.closeReport} />}
		</>
	)
}

// preserve native touch targets and selected icon colors
function PageAction({
	label,
	Icon: ActionIcon,
	isActive,
	isDisabled,
	disabledReason,
	onSelect,
}: SharedPageActionOption<LucideIcon>) {
	// a disabled option with a reason stays pressable, and its press says why in a dialog
	const hasDisabledReason = Boolean(isDisabled && disabledReason)
	return (
		<Button
			variant="ghost"
			className={cn("min-h-12 justify-start", hasDisabledReason && "opacity-50")}
			accessibilityLabel={label}
			accessibilityState={{ selected: isActive, disabled: isDisabled }}
			disabled={isDisabled && !hasDisabledReason}
			onPress={hasDisabledReason ? () => Alert.alert(label, disabledReason) : onSelect}
		>
			<Icon as={ActionIcon} {...toActiveIconProps(isActive, "size-4 text-muted-foreground")} />
			<Text>{label}</Text>
		</Button>
	)
}
