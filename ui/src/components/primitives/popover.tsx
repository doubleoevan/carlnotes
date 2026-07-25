import * as PopoverPrimitive from "@radix-ui/react-popover"
import { X } from "lucide-react"
import type * as React from "react"

import { cn } from "@/lib/utils"

// popover root — shadcn new-york; used for the info popovers on topics and resources
function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
	return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

// the click/tap target that opens a popover
function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
	return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

// the portalled, animated panel
function PopoverContent({
	className,
	align = "center",
	sideOffset = 4,
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
	// portal so the panel escapes overflow; the classes animate it in and out
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Content
				data-slot="popover-content"
				align={align}
				sideOffset={sideOffset}
				className={cn(
					"bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 relative z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
					className,
				)}
				{...props}
			/>
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

export { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger }
