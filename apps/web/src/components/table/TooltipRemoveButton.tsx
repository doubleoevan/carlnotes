import { X } from "lucide-react"
import { Button } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { type TableActionLabelParts, toTableActionLabel, toTableActionTooltip } from "@/lib/tableActionLabel"

/**
 * A table row's ghost X button with a tooltip that names its action and, in bold, the name it acts on.
 */
export function TooltipRemoveButton({
	action,
	name,
	afterName,
	isDisabled = false,
	onPress,
}: TableActionLabelParts & { isDisabled?: boolean; onPress: () => void }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					size="icon-sm"
					variant="ghost"
					disabled={isDisabled}
					onClick={onPress}
					aria-label={toTableActionLabel({ action, name, afterName })}
				>
					<X className="size-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{toTableActionTooltip({ action, name, afterName })}</TooltipContent>
		</Tooltip>
	)
}
