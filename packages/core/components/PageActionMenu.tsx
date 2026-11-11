import type { ComponentType } from "react"
import { toReportImageLabel, toReportLabel } from "../lib/socialLabels"

// platform icons remain adapters; ordering and visibility belong to the shared menu
export type PageActionOption<Icon> = {
	label: string
	Icon: Icon
	isActive?: boolean
	isDisabled?: boolean
	// why a disabled option is disabled, in a tooltip on the web and a dialog on its press in the app
	disabledReason?: string
	onSelect: () => void
}

/**
 * Composes page actions and the same global New topic, Add to AI, and Report issue controls.
 */
export function PageActionMenu<Icon>({
	options = [],
	hasNewTopicButton,
	icons,
	onNewTopic,
	onAddToAi,
	onReport,
	isReported,
	isImageReport,
	onClose,
	Option,
}: {
	options?: PageActionOption<Icon>[]
	hasNewTopicButton?: boolean
	icons: { Plus: Icon; Bot: Icon; Flag: Icon }
	onNewTopic: () => void
	onAddToAi: () => void
	onReport?: () => void
	isReported?: boolean
	// whether the page's report flags an image, which the option then names
	isImageReport?: boolean
	onClose: () => void
	Option: ComponentType<PageActionOption<Icon>>
}) {
	// the report option names an image if the page's report flags one
	const reportLabel = isImageReport ? toReportImageLabel(Boolean(isReported)) : toReportLabel(Boolean(isReported))
	const actions = [
		...options,
		...(hasNewTopicButton ? [] : [{ label: "New topic", Icon: icons.Plus, onSelect: onNewTopic }]),
		{ label: "Add to AI", Icon: icons.Bot, onSelect: onAddToAi },
		...(onReport ? [{ label: reportLabel, Icon: icons.Flag, isActive: isReported, onSelect: onReport }] : []),
	]
	return actions.map((action) => (
		<Option
			key={action.label}
			{...action}
			onSelect={() => {
				onClose()
				action.onSelect()
			}}
		/>
	))
}
