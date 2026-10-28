import { authClient } from "@carlnotes/client/authClient"
import {
	PageActionMenu as SharedPageActionMenu,
	type PageActionOption as SharedPageActionOption,
} from "@carlnotes/core/components/PageActionMenu"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { Bot, EllipsisVertical, Flag, type LucideIcon, Plus } from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import type { View } from "react-native"
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
	const [isReporting, setIsReporting] = useState(false)
	const [isAddingToAi, setIsAddingToAi] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()
	const { data: session } = authClient().useSession()
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
						onReport={report && session ? () => setIsReporting(true) : undefined}
						onClose={() => setIsOpen(false)}
						Option={PageAction}
					/>
				</Sheet>
			)}
			{/* reuse the same native forms wherever a global action is offered */}
			{newTopicDialog}
			{isAddingToAi && (
				<AddToAiDialog
					mcpServer={{ name: "CarlNotes", url: `${SITE_URL}/mcp` }}
					onClose={() => setIsAddingToAi(false)}
				/>
			)}
			{isReporting && report && <ReportIssueDialog {...report} onClose={() => setIsReporting(false)} />}
		</>
	)
}

// preserve native touch targets and selected icon colors
function PageAction({ label, Icon: ActionIcon, isActive, isDisabled, onSelect }: SharedPageActionOption<LucideIcon>) {
	return (
		<Button
			variant="ghost"
			className="min-h-12 justify-start"
			accessibilityLabel={label}
			accessibilityState={{ selected: isActive }}
			disabled={isDisabled}
			onPress={onSelect}
		>
			<Icon
				as={ActionIcon}
				className={isActive ? "size-4 text-primary" : "size-4 text-muted-foreground"}
				fill={isActive ? "currentColor" : "none"}
			/>
			<Text>{label}</Text>
		</Button>
	)
}
