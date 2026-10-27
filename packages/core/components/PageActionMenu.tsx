import type { ComponentType } from "react"

// platform icons remain adapters; ordering and visibility belong to the shared menu
export type PageActionOption<Icon> = {
	label: string
	Icon: Icon
	isActive?: boolean
	isDisabled?: boolean
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
	onClose,
	Option,
}: {
	options?: PageActionOption<Icon>[]
	hasNewTopicButton?: boolean
	icons: { Plus: Icon; Bot: Icon; Flag: Icon }
	onNewTopic: () => void
	onAddToAi: () => void
	onReport?: () => void
	onClose: () => void
	Option: ComponentType<PageActionOption<Icon>>
}) {
	const actions = [
		...options,
		...(hasNewTopicButton ? [] : [{ label: "New topic", Icon: icons.Plus, onSelect: onNewTopic }]),
		{ label: "Add to AI", Icon: icons.Bot, onSelect: onAddToAi },
		...(onReport ? [{ label: "Report issue", Icon: icons.Flag, onSelect: onReport }] : []),
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
