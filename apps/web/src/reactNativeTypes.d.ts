// the React Native types that react-native-enriched-html's declarations import. the web app never loads React Native,
// and React Native's own global declarations would merge into the DOM's, so tsconfig maps "react-native" here

/** A color, as a CSS color string. */
export type ColorValue = string

/** A length: pixels, a percentage, or auto. */
export type DimensionValue = number | `${number}%` | "auto" | null

/** The text style fields the editor's declarations index into, with every other field open. */
export type TextStyle = {
	color?: ColorValue
	fontFamily?: string
	fontSize?: number
	fontStyle?: "normal" | "italic"
	// the weight a face is picked by, as a keyword, a number, or a numeric string
	fontWeight?: "normal" | "bold" | number | `${number}`
	lineHeight?: number
	[field: string]: unknown
}

/** The props every React Native view takes, of which the editor's declarations read the style alone. */
export type ViewProps = {
	style?: unknown
}

/** An event wrapped the way React Native wraps a native one. */
export type NativeSyntheticEvent<Payload> = { nativeEvent: Payload }

/** The payload of a focus or blur event. */
export type TargetedEvent = { target: number }

/** The return key labels a software keyboard offers. */
export type ReturnKeyTypeOptions = "done" | "go" | "next" | "search" | "send" | "none" | "previous" | "default"

/** The methods every React Native host component instance has. The editor's declarations add their own, so none here. */
export type NativeMethods = Record<never, never>
