import type * as React from "react"

import { cn } from "@/lib/utils"

export function Card({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="resource"
			className={cn(
				"bg-resource text-resource-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
				className,
			)}
			{...props}
		/>
	)
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="resource-header"
			className={cn(
				"@container/resource-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=resource-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
				className,
			)}
			{...props}
		/>
	)
}

export function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="resource-title" className={cn("leading-none font-semibold", className)} {...props} />
}

export function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="resource-description" className={cn("text-muted-foreground text-sm", className)} {...props} />
}

export function CardAction({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="resource-action"
			className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
			{...props}
		/>
	)
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="resource-content" className={cn("px-6", className)} {...props} />
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div data-slot="resource-footer" className={cn("flex items-center px-6 [.border-t]:pt-6", className)} {...props} />
	)
}
