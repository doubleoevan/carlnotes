import * as SelectPrimitive from "@radix-ui/react-select"
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { toTimeLabel } from "@/lib/labels"
import { cn } from "@/lib/utils"

// every half-hour of the day, paired as an AM slot and its PM counterpart
const TIME_ROWS = Array.from({ length: 24 }, (_, index) => {
	const hours = String(Math.floor(index / 2)).padStart(2, "0")
	const minutes = index % 2 === 0 ? "00" : "30"
	return { am: `${hours}:${minutes}`, pm: `${String(Number(hours) + 12).padStart(2, "0")}:${minutes}` }
})

/**
 * A time-of-day picker: the shared Select with its options laid out AM and PM side by side.
 */
export function TimePicker({
	scheduledTime,
	onChange,
}: {
	scheduledTime: string
	onChange: (scheduledTime: string) => void
}) {
	return (
		<Select value={scheduledTime} onValueChange={onChange}>
			<SelectTrigger className="w-32" aria-label="Scheduled time">
				<SelectValue>{toTimeLabel(scheduledTime)}</SelectValue>
			</SelectTrigger>
			<SelectContent className="w-48">
				{/* one row per half-hour, its AM slot on the left and its PM slot on the right */}
				{TIME_ROWS.map(({ am, pm }) => (
					<div key={am} className="flex gap-1">
						<TimeSlot time={am} />
						<TimeSlot time={pm} />
					</div>
				))}
			</SelectContent>
		</Select>
	)
}

// one selectable time slot, half the width of the list, so an AM and a PM slot share a row
function TimeSlot({ time }: { time: string }) {
	return (
		<SelectPrimitive.Item
			value={time}
			className={cn(
				"focus:bg-accent focus:text-accent-foreground",
				"flex min-h-9 w-1/2 cursor-default items-center rounded-sm px-2 text-sm outline-hidden select-none",
			)}
		>
			<SelectPrimitive.ItemText>{toTimeLabel(time)}</SelectPrimitive.ItemText>
		</SelectPrimitive.Item>
	)
}
