import * as PopoverPrimitive from "@radix-ui/react-popover"
import { X } from "lucide-react"
import type * as React from "react"

import { HIGHLIGHT_SCROLLBAR_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// the shadcn new-york popover root
function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
	return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

// the click/tap target that opens a popover
function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
	return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

// what the panel positions against
function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
	return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

// how far the panel stays clear of the viewport edges
const COLLISION_PADDING = 8

// the portalled, animated panel. className sizes and positions the shell, and bodyClassName styles the scrolling body inside it, padding included
function PopoverContent({
	className,
	bodyClassName,
	align = "center",
	sideOffset = 4,
	collisionPadding = COLLISION_PADDING,
	children,
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & { bodyClassName?: string }) {
	// the portal lifts the panel out of any overflow clipping. the classes animate it in and out
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Content
				data-slot="popover-content"
				align={align}
				sideOffset={sideOffset}
				collisionPadding={collisionPadding}
				// opening the panel leaves focus on the trigger. a field that wants the caret marks itself autoFocus.
				// this sits above the spread, and a caller's own handler can override it
				onOpenAutoFocus={(event) => event.preventDefault()}
				className={cn(
					"bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 relative z-50 flex max-h-(--radix-popover-content-available-height) w-72 flex-col origin-(--radix-popover-content-transform-origin) overflow-hidden rounded-md border shadow-lift outline-hidden",
					className,
				)}
				{...props}
			>
				{/* the scrolling body. the shell around it never scrolls. padding lives here, on the same box as the scrollbar,
				    and overscroll-contain keeps a drag here off the page behind */}
				<div
					data-slot="popover-viewport"
					className={cn("min-h-0 overflow-y-auto overscroll-contain p-4", HIGHLIGHT_SCROLLBAR_CLASS, bodyClassName)}
				>
					{children}
				</div>
			</PopoverPrimitive.Content>
		</PopoverPrimitive.Portal>
	)
}

// the ✕ that dismisses a popover, pinned to its top-right corner
function PopoverCloseButton() {
	return (
		<PopoverPrimitive.Close
			data-slot="popover-close"
			aria-label="Close"
			className="text-muted-foreground hover:text-foreground absolute top-2 right-2 grid size-6 place-items-center rounded-md"
		>
			<X className="size-4" />
		</PopoverPrimitive.Close>
	)
}

// the raw radix close, for callers styling their own close button
const PopoverClose = PopoverPrimitive.Close

export { Popover, PopoverAnchor, PopoverClose, PopoverCloseButton, PopoverContent, PopoverTrigger }
