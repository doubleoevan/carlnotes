import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * Shows a count after its label, as in "Viewers: 12", with the number highlighted. The number flashes once each time the
 * count changes after its first value, and stays still for someone who prefers reduced motion.
 */
export function FlashingCount({ label, count }: { label: string; count: number }) {
	// each change after the first value gives the number a new key, which replays the flash
	const shownCount = useRef(count)
	const [flashKey, setFlashKey] = useState(0)
	useEffect(() => {
		if (shownCount.current !== count) {
			shownCount.current = count
			setFlashKey((currentFlashKey) => currentFlashKey + 1)
		}
	}, [count])
	return (
		<span>
			{label}:{" "}
			<span
				key={flashKey}
				className={cn(
					"text-foreground inline-block min-w-[1.5em] rounded-full px-1.5 text-center font-semibold tabular-nums",
					flashKey > 0 && "animate-count-flash",
				)}
			>
				{count.toLocaleString()}
			</span>
		</span>
	)
}
