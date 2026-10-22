// the hook a controlled component's story uses to report a change and keep the matching control in sync
import type { Args } from "@storybook/tanstack-react"
import { useArgs } from "storybook/preview-api"

/**
 * Returns a handler that passes a new value to the arg's action, then writes the value back into the named arg, so
 * the control matches what the component shows.
 */
export function useSyncedArg<TArgs extends Args, TArgName extends keyof TArgs>(
	argName: TArgName,
	onChange?: (value: Exclude<TArgs[TArgName], undefined>) => void,
): (value: Exclude<TArgs[TArgName], undefined>) => void {
	// the setter that writes an arg back into the story's controls, and the handler that calls it
	const [, updateArgs] = useArgs<TArgs>()
	return (value) => {
		// report the change, then keep the control in sync
		onChange?.(value)
		updateArgs({ [argName]: value } as Partial<TArgs>)
	}
}
