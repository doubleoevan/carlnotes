// Propose textured patches from the image itself, then let the vision planner assess each actual crop.
import sharp, { type OverlayOptions } from "sharp"
import { canAnimateRegion, isInsidePicture, type PictureAnimation } from "./pictureAnimation"
import { VIDEO_HEIGHT, VIDEO_WIDTH } from "./videoFrames"

const WIDTH = 512
const HEIGHT = 288
const CHOICES_PER_PICTURE = 4
type Bounds = Omit<PictureAnimation, "effect">
type Choice = { region: PictureAnimation; score: number }
export type AnimationCandidate = {
	sourceImageHash: string
	width: number
	height: number
	origin: "resource" | "generated"
	thumbnail: (width: number) => Promise<Uint8Array>
}

/**
 * Shows an overview beside labeled close-ups, each bound to a single effect supported by its pixels.
 */
export async function pictureAnimationChoices(
	picture: AnimationCandidate,
	index: number,
): Promise<{ jpeg: Uint8Array; choices: Map<number, PictureAnimation> }> {
	// Use the displayed composition, including the actual foreground's position on the backdrop.
	const thumbnail = await sharp(await picture.thumbnail(WIDTH))
		.resize(WIDTH, HEIGHT)
		.flatten()
		.toColourspace("srgb")
		.removeAlpha()
		.raw()
		.toBuffer()
	const source = { raw: { width: WIDTH, height: HEIGHT, channels: 3 as const } }
	const choices = new Map<number, PictureAnimation>()
	const tiles: OverlayOptions[] = [{ input: await sharp(thumbnail, source).png().toBuffer(), left: 0, top: 0 }]
	const candidates = proposePatches(thumbnail, picture)
	for (const [i, { region }] of candidates.entries()) {
		// Print the trusted number and suggested effect directly beside the isolated patch.
		const number = index * CHOICES_PER_PICTURE + i + 1
		const box = thumbnailBox(region)
		const crop = await sharp(thumbnail, source)
			.extract(box)
			.resize(192, 112, { fit: "contain", background: "#181818" })
			.png()
			.toBuffer()
		const label = Buffer.from(
			`<svg width="192" height="26"><text x="5" y="20" font-family="sans-serif" font-weight="bold" font-size="18" fill="white">${number} · ${region.effect}</text></svg>`,
		)
		tiles.push(
			{ input: label, left: WIDTH + (i % 2) * 192, top: Math.floor(i / 2) * 144 },
			{ input: crop, left: WIDTH + (i % 2) * 192, top: Math.floor(i / 2) * 144 + 26 },
		)
		choices.set(number, region)
	}

	// Keep the planner input under one megapixel for every three pictures.
	const jpeg = await sharp({ create: { width: WIDTH + 384, height: HEIGHT, channels: 3, background: "#181818" } })
		.composite(tiles)
		.jpeg({ quality: 84 })
		.toBuffer()
	return { jpeg, choices }
}

// Keep the strongest supported patch for each material and offer up to four distinct effects.
function proposePatches(pixels: Uint8Array, picture: AnimationCandidate): Choice[] {
	const best = new Map<PictureAnimation["effect"], Choice>()
	for (const box of foregroundWindows(picture)) {
		for (const [effect, score] of patchScores(pixels, box)) {
			const region = { ...box, effect }
			if (score > (best.get(effect)?.score ?? 0) && canAnimateRegion(region, picture.origin)) {
				best.set(effect, { region, score })
			}
		}
	}
	return [...best.values()].sort((a, b) => b.score - a.score).slice(0, CHOICES_PER_PICTURE)
}

// Compare a fixed grid at three scales within the upright foreground.
function* foregroundWindows(picture: AnimationCandidate): Generator<Bounds> {
	const scale = Math.min(1, VIDEO_WIDTH / picture.width, VIDEO_HEIGHT / picture.height)
	const foregroundWidth = Math.floor((1000 * picture.width * scale) / VIDEO_WIDTH)
	const foregroundHeight = Math.floor((1000 * picture.height * scale) / VIDEO_HEIGHT)
	const marginX = Math.ceil((1000 - foregroundWidth) / 2)
	const marginY = Math.ceil((1000 - foregroundHeight) / 2)
	for (const [w, h] of [
		[0.24, 0.24],
		[0.42, 0.32],
		[0.17, 0.15],
	] as const) {
		const width = Math.floor(foregroundWidth * w),
			height = Math.floor(foregroundHeight * h)
		for (const x of [0, 0.25, 0.5, 0.75, 1]) {
			for (const y of [0, 0.25, 0.5, 0.75, 1]) {
				const left = marginX + Math.round(x * (foregroundWidth - width)),
					top = marginY + Math.round(y * (foregroundHeight - height))
				const box = { left, top, right: left + width, bottom: top + height }
				if (isInsidePicture({ ...box, effect: "water" }, picture)) {
					yield box
				}
			}
		}
	}
}

// Favor continuous surfaces with room to move. The vision planner confirms the pictured material.
function patchScores(pixels: Uint8Array, region: Bounds): [PictureAnimation["effect"], number][] {
	const box = thumbnailBox(region)
	const {
		count,
		cool,
		green,
		bright,
		pale,
		warm,
		textureX,
		textureY,
		borderSum,
		borderSquared,
		borderCount,
		centerSum,
		centerCount,
	} = samplePatch(pixels, box)
	const dx = textureX / count,
		dy = textureY / count
	const texture = Math.min(1, (dx + dy) / 16)
	const size = Math.min(1, (box.width * box.height) / 22000)
	const uniformBorder = Math.sqrt(Math.max(0, borderSquared / borderCount - (borderSum / borderCount) ** 2)) < 12
	return [
		[
			"water",
			region.top >= 440 && cool / count > 0.52 && dy > dx * 0.9 ? (2 * cool) / count + texture * 0.3 + size * 0.2 : 0,
		],
		["foliage", green / count > 0.48 && texture > 0.27 ? (1.5 * green) / count + texture * 0.4 + size * 0.2 : 0],
		[
			"glint",
			bright / count > 0.15 && bright / count < 0.78 && warm / count > 0.23
				? 0.6 + Math.min(0.5, bright / count) + size * 0.25
				: 0,
		],
		[
			"steam",
			pale / count > 0.4 && pale / count < 0.84 && region.top < 620 ? 0.5 + (pale / count) * 0.45 + texture * 0.1 : 0,
		],
		["rain", pale / count > 0.33 && dx > dy * 1.6 && dx > 5 ? 0.6 + texture * 0.4 : 0],
		[
			"paper",
			uniformBorder && centerSum / centerCount > borderSum / borderCount + 25 && bright / count > 0.12
				? 1.4 + size * 0.1
				: 0,
		],
	]
}

// Sample the brightness, color and directional texture at three-pixel intervals.
function samplePatch(pixels: Uint8Array, box: ReturnType<typeof thumbnailBox>) {
	let count = 0,
		cool = 0,
		green = 0,
		bright = 0,
		pale = 0,
		warm = 0,
		textureX = 0,
		textureY = 0
	let borderSum = 0,
		borderSquared = 0,
		borderCount = 0,
		centerSum = 0,
		centerCount = 0
	for (let y = 1; y < box.height - 1; y += 3) {
		for (let x = 1; x < box.width - 1; x += 3) {
			const i = ((box.top + y) * WIDTH + box.left + x) * 3
			const r = pixels[i] ?? 0,
				g = pixels[i + 1] ?? 0,
				b = pixels[i + 2] ?? 0,
				l = (r + 2 * g + b) / 4
			count++
			cool += Number(isWaterColor(r, g, b))
			green += Number(isLeafColor(r, g, b))
			bright += Number(l > 184)
			pale += Number(Math.max(r, g, b) - Math.min(r, g, b) < 37 && l > 140)
			warm += Number(r > b * 1.15 && g > b * 1.04)
			textureX += Math.abs(g - (pixels[i + 4] ?? g))
			textureY += Math.abs(g - (pixels[i + 3 * WIDTH + 1] ?? g))
			if (nearBorder(x, box.width) || nearBorder(y, box.height)) {
				borderSum += l
				borderSquared += l * l
				borderCount++
			} else {
				centerSum += l
				centerCount++
			}
		}
	}
	return {
		count,
		cool,
		green,
		bright,
		pale,
		warm,
		textureX,
		textureY,
		borderSum,
		borderSquared,
		borderCount,
		centerSum,
		centerCount,
	}
}

// Nominate blue-green water and distinguish muted greens from neutral cast shadows.
function isWaterColor(red: number, green: number, blue: number): boolean {
	return blue > red * 1.06 && green > red * 1.06 && Math.min(blue, green) > 45
}
function isLeafColor(red: number, green: number, blue: number): boolean {
	return green > red * 0.96 && green > blue * 1.14 && green > 40
}

// Sample the outer band separately so a loose sheet can move against a uniform background.
function nearBorder(position: number, extent: number): boolean {
	return position < extent * 0.15 || position > extent * 0.85
}

// Round both edges in the same coordinate system used to draw the contact sheet.
function thumbnailBox(box: Bounds): { left: number; top: number; width: number; height: number } {
	const left = Math.round((box.left * WIDTH) / 1000),
		top = Math.round((box.top * HEIGHT) / 1000)
	return {
		left,
		top,
		width: Math.round((box.right * WIDTH) / 1000) - left,
		height: Math.round((box.bottom * HEIGHT) / 1000) - top,
	}
}
