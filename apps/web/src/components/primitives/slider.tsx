import { cn } from "@carlnotes/nightshift/classNames"
import { Slider as SliderPrimitive } from "radix-ui"
import type * as React from "react"

// a range input with one thumb per value, each thumb named by the aria-label — shadcn new-york
function Slider({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	"aria-label": ariaLabel,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
	// one thumb for each value, or for each end with no value given
	const thumbValues = Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]
	return (
		<SliderPrimitive.Root
			data-slot="slider"
			defaultValue={defaultValue}
			value={value}
			min={min}
			max={max}
			className={cn(
				"relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track
				data-slot="slider-track"
				className="bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
			>
				<SliderPrimitive.Range
					data-slot="slider-range"
					className="bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
				/>
			</SliderPrimitive.Track>
			{thumbValues.map((_, thumbIndex) => (
				<SliderPrimitive.Thumb
					data-slot="slider-thumb"
					aria-label={ariaLabel}
					// biome-ignore lint/suspicious/noArrayIndexKey: a thumb is its position in the value list
					key={thumbIndex}
					className="border-primary bg-background ring-ring/50 block size-4 shrink-0 rounded-full border shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
				/>
			))}
		</SliderPrimitive.Root>
	)
}

export { Slider }
