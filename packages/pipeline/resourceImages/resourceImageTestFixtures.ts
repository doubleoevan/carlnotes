// the test pictures the Resource Image tests share, drawn by sharp
import sharp from "sharp"

// a test picture: its pixel size, the picture it shows, the file type it is written as, a jpeg if none is given, and
// whether it is a flat graphic of a few grays instead of a picture of many colors
export type ToTestImageBytesOptions = {
	width: number
	height: number
	picture: number
	format?: "jpeg" | "png" | "gif" | "webp"
	isFlat?: boolean
}

/**
 * Draws one picture at a size: a row of bars whose heights and shades the picture number picks, so two pictures differ
 * and one picture looks the same at any size. A picture's bars stand over a colored gradient, and a flat graphic's over
 * one gray.
 */
export async function toTestImageBytes({
	width,
	height,
	picture,
	format = "jpeg",
	isFlat = false,
}: ToTestImageBytesOptions): Promise<Uint8Array> {
	// eight bars across a 160 by 90 drawing, each one's height and shade from the picture number
	const bars = Array.from({ length: 8 }, (_, i) => {
		const barHeight = 10 + ((picture * 37 + i * 53) % 80)
		const shade = 40 + ((picture * 91 + i * 67) % 200)
		return `<rect x="${i * 20}" y="${90 - barHeight}" width="20" height="${barHeight}" fill="rgb(${shade},${shade},${shade})"/>`
	})
	// a gradient through many colors from top to bottom for a picture, or one gray for a flat graphic. the bars alone
	// set the difference hash
	const gradient = `<defs><linearGradient id="background" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="rgb(200,40,40)"/><stop offset="0.5" stop-color="rgb(40,200,90)"/>
		<stop offset="1" stop-color="rgb(40,60,220)"/></linearGradient></defs>`
	const background = isFlat ? "rgb(128,128,128)" : "url(#background)"
	const drawing = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" preserveAspectRatio="none">
		${gradient}<rect width="160" height="90" fill="${background}"/>${bars.join("")}</svg>`

	// stretch the drawing to the size, in the file type
	const image = sharp(Buffer.from(drawing)).resize(width, height, { fit: "fill" })
	return new Uint8Array(await image.toFormat(format).toBuffer())
}
