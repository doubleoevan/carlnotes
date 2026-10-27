// the white cup and saucer in the chat launcher
export const COFFEE_CUP_VIEW_BOX = "0 0 32 32"
export const COFFEE_CUP_FILL = "#fff"
export const coffeeCupSteamWisps = [
	{ x: 9.5, delayMs: 0 },
	{ x: 13.5, delayMs: 600 },
	{ x: 17.5, delayMs: 1200 },
]
export const coffeeCupPaths = [
	{ d: "M4 25.5 a9.5 2.4 0 0 0 19 0 Z", fill: COFFEE_CUP_FILL, strokeWidth: 1.4 },
	{ d: "M20 16 h2.3 a2.9 2.9 0 0 1 0 5.8 h-1.6", fill: "none", strokeWidth: 1.8 },
	{ d: "M7 15 L7.6 20.5 A6 6 0 0 0 19.4 20.5 L20 15 Z", fill: COFFEE_CUP_FILL, strokeWidth: 1.8 },
]

/**
 * Returns one steam wisp above the shared cup.
 */
export function toCoffeeCupSteamPath(x: number): string {
	return `M${x} 12.5 q-2 -1.6 0 -3.2 q2 -1.6 0 -3.2`
}
