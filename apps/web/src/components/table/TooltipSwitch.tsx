import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { type TableActionLabelParts, toTableActionLabel, toTableActionTooltip } from "@/lib/tableActionLabel"

/**
 * A table row's switch with a tooltip that names its action and, in bold, the name it acts on.
 */
export function TooltipSwitch({
	action,
	name,
	afterName,
	isChecked,
	isDisabled = false,
	className,
	onChange,
}: TableActionLabelParts & {
	isChecked: boolean
	isDisabled?: boolean
	className?: string
	onChange: (isChecked: boolean) => void
}) {
	return (
		<Tooltip>
			{/* the trigger wraps the switch in a span. both write data-state to the same element otherwise */}
			<TooltipTrigger asChild>
				<span className="inline-flex">
					<Switch
						checked={isChecked}
						disabled={isDisabled}
						className={className}
						onCheckedChange={onChange}
						aria-label={toTableActionLabel({ action, name, afterName })}
					/>
				</span>
			</TooltipTrigger>
			<TooltipContent>{toTableActionTooltip({ action, name, afterName })}</TooltipContent>
		</Tooltip>
	)
}
