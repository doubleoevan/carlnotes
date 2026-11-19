import { cn } from "@carlnotes/nightshift/classNames"
import type { ElementType, ReactNode } from "react"

type TopicVideoCardSkeletonProps = {
	Box: ElementType<{ className: string; children?: ReactNode }>
	shapeClassName: string
	seekBarClassName: string
}

// keep the two control groups together when the card is narrow
const CONTROL_GROUPS = [
	["back", "forward", "speed"],
	["captions", "mute", "picture-in-picture", "fullscreen"],
] as const

/** Reserves the title, picture, seek bar, and controls inside a film card on either page. */
export function TopicVideoCardSkeleton({ Box, shapeClassName, seekBarClassName }: TopicVideoCardSkeletonProps) {
	return (
		<>
			{/* the title at the top left, on the heading's line */}
			<Box className="flex h-[1.55rem] flex-col justify-center">
				<Box className={cn(shapeClassName, "h-4 w-72 max-w-full")} />
			</Box>
			{/* the film frame and the platform's seek bar */}
			<Box className={cn(shapeClassName, "aspect-video w-full rounded-lg")} />
			<Box className={cn("flex flex-col justify-center", seekBarClassName)}>
				<Box className={cn(shapeClassName, "h-1.5 rounded-full")} />
			</Box>
			{/* the playback controls and the film controls */}
			<Box className="flex flex-row flex-wrap items-center justify-between gap-1.5">
				{CONTROL_GROUPS.map((controls) => (
					<Box key={controls[0]} className="flex flex-row items-center gap-1.5">
						{controls.map((control) => (
							<Box key={control} className={cn(shapeClassName, "h-11 w-11 rounded-lg sm:h-9")} />
						))}
					</Box>
				))}
			</Box>
		</>
	)
}
