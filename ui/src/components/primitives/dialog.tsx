import { X } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import type * as React from "react"

import { cn } from "@/lib/utils"

// dialog root — shadcn new-york, trimmed to what the app uses. the edit modal and delete confirmation build on it
function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

// the dimmed backdrop behind the panel
function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
	return (
		<DialogPrimitive.Overlay
			data-slot="dialog-overlay"
			className={cn(
				"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
				className,
			)}
			{...props}
		/>
	)
}

// the centered, portalled panel with its ✕ close in the top corner
function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
	return (
		<DialogPrimitive.Portal data-slot="dialog-portal">
			<DialogOverlay />
			<DialogPrimitive.Content
				data-slot="dialog-content"
				className={cn(
					"bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-1/2 left-1/2 z-50 grid max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border p-6 shadow-lift",
					className,
				)}
				{...props}
			>
				{children}
				{/* the ✕ close in the top corner */}
				<DialogPrimitive.Close
					className="focus-visible:ring-ring/50 text-muted-foreground hover:text-foreground absolute top-4 right-4 grid size-8 place-items-center rounded-md outline-none focus-visible:ring-[3px]"
					aria-label="Close"
				>
					<X className="size-4" />
				</DialogPrimitive.Close>
			</DialogPrimitive.Content>
		</DialogPrimitive.Portal>
	)
}

// the dialog heading in the display font
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			data-slot="dialog-title"
			className={cn("font-display text-2xl leading-none", className)}
			{...props}
		/>
	)
}

// supporting copy under the title
function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			data-slot="dialog-description"
			className={cn("text-muted-foreground text-sm", className)}
			{...props}
		/>
	)
}

// the right-aligned action row at the bottom
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="dialog-footer" className={cn("flex justify-end gap-2", className)} {...props} />
}

export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle }
