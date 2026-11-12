// the test pictures the Resource Image tests share, drawn by sharp
import sharp from "sharp"

// a test picture: its pixel size, the picture it shows, and the file type it is written as, a jpeg if none is given
export type ToTestImageBytesOptions = {
	width: number
	height: number
	picture: number
	format?: "jpeg" | "png" | "gif" | "webp"
}

/**
 * Draws one picture at a size: a row of bars whose heights and shades the picture number picks, so two pictures differ
 * and one picture looks the same at any size.
 */
export async function toTestImageBytes({
	width,
	height,
	picture,
	format = "jpeg",
}: ToTestImageBytesOptions): Promise<Uint8Array> {
	// eight bars across a 160 by 90 drawing, each one's height and shade from the picture number
	const bars = Array.from({ length: 8 }, (_, i) => {
		const barHeight = 10 + ((picture * 37 + i * 53) % 80)
		const shade = 40 + ((picture * 91 + i * 67) % 200)
		return `<rect x="${i * 20}" y="${90 - barHeight}" width="20" height="${barHeight}" fill="rgb(${shade},${shade},${shade})"/>`
	})
	const drawing = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" preserveAspectRatio="none">
		<rect width="160" height="90" fill="rgb(128,128,128)"/>${bars.join("")}</svg>`

	// stretch the drawing to the size, in the file type
	const image = sharp(Buffer.from(drawing)).resize(width, height, { fit: "fill" })
	return new Uint8Array(await image.toFormat(format).toBuffer())
}
