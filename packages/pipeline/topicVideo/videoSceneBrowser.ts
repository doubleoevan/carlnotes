// Render approved full-frame pictures on the same frame clock as the recorded chapter.
import {
	CanvasTexture,
	Mesh,
	MeshBasicMaterial,
	OrthographicCamera,
	PlaneGeometry,
	Scene,
	SRGBColorSpace,
	WebGLRenderer,
} from "three"
import type { VideoScenePlan } from "./videoScenePlan"

export type VideoSceneDocument = {
	plan: VideoScenePlan
	imageFiles: { sourceImageHash: string; url: string }[]
	lowerThird: string
	espresso: string
}

declare global {
	interface Window {
		startVideoScene: (data: VideoSceneDocument) => Promise<void>
		drawVideoScene: (frame: number) => Promise<string>
	}
}

const width = 1280
const height = 720
const fps = 24

// Decode the complete approved image before capture starts.
async function loadImage(url: string) {
	const image = new Image()
	image.src = url
	await image.decode()
	return image
}

// Wait for the first decoded frame, including media loaded with the playhead already at zero.
async function loadAnimation(animationFileHash: string) {
	const video = document.createElement("video")
	video.muted = true
	video.preload = "auto"
	const loaded = new Promise<void>((resolve, reject) => {
		video.onloadeddata = () => resolve()
		video.onerror = () => reject(Error("Could not decode reviewed picture animation"))
	})
	video.src = `/${animationFileHash}.webm`
	await loaded
	if (video.videoWidth !== width || video.videoHeight !== height || !(video.duration > 0 && video.duration <= 10)) {
		throw Error("Reviewed animation must match the delivery frame and fit one shot")
	}
	return video
}

// Sample the middle of the required frame. An explicit seek makes random and sequential capture agree.
async function drawAnimation(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, frame: number) {
	const count = Math.round(video.duration * fps)
	const time = ((frame % count) + 0.5) / fps
	if (Math.abs(video.currentTime - time) > 0.001) {
		const ready = new Promise<void>((resolve, reject) => {
			video.onseeked = () => resolve()
			video.onerror = () => reject(Error("Could not seek reviewed picture animation"))
		})
		video.currentTime = time
		await ready
	}
	ctx.drawImage(video, 0, 0, width, height)
}

// Fill the delivery frame like the montage. A portrait keeps its proportions over its own softened backdrop.
function composeStill(image: HTMLImageElement) {
	const surface = document.createElement("canvas")
	surface.width = width
	surface.height = height
	const ctx = surface.getContext("2d", { alpha: false })
	if (!ctx) {
		throw Error("Missing film drawing surface")
	}
	const needsBackdrop = Math.abs(image.width / image.height - width / height) > 0.02
	const fit = (needsBackdrop ? Math.min : Math.max)(width / image.width, height / image.height)
	if (needsBackdrop) {
		const cover = Math.max(width / image.width, height / image.height) * 1.12
		ctx.filter = "blur(20px) brightness(45%)"
		ctx.drawImage(
			image,
			(width - image.width * cover) / 2,
			(height - image.height * cover) / 2,
			image.width * cover,
			image.height * cover,
		)
		ctx.filter = "none"
	}
	ctx.drawImage(
		image,
		(width - image.width * fit) / 2,
		(height - image.height * fit) / 2,
		image.width * fit,
		image.height * fit,
	)
	const texture = new CanvasTexture(surface)
	texture.colorSpace = SRGBColorSpace
	return texture
}

// Preview a movement on the authoring canvas. Published chapters use the montage encoder.
function cameraPosition(move: string, progress: number) {
	if (move === "zoom-in") {
		return { zoom: 1 + 0.15 * progress, x: 0 }
	}
	if (move === "zoom-out") {
		return { zoom: 1.15 - 0.15 * progress, x: 0 }
	}
	const direction = move === "pan-left" ? 1 : -1
	return { zoom: 1.11, x: (progress * 2 - 1) * 0.105 * direction }
}

window.startVideoScene = async ({ plan, imageFiles, lowerThird, espresso }) => {
	// Draw the approved image edge to edge. The orthographic camera keeps every plane square to the viewer.
	const gl = new WebGLRenderer({ antialias: false, preserveDrawingBuffer: true })
	gl.setSize(width, height, false)
	const stage = new Scene()
	const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 5)
	camera.position.z = 1
	const material = new MeshBasicMaterial()
	const picture = new Mesh(new PlaneGeometry(2, 2), material)
	stage.add(picture)

	// Decode local assets once per chapter, including only animation selected in the verified plan.
	const photos = new Map(
		await Promise.all(
			imageFiles.map(async (asset) => [asset.sourceImageHash, composeStill(await loadImage(asset.url))] as const),
		),
	)
	const animations = new Map<string, HTMLVideoElement>()
	for (const image of plan.videoSceneImages) {
		if (image.animationFileHash && !animations.has(image.animationFileHash)) {
			animations.set(image.animationFileHash, await loadAnimation(image.animationFileHash))
		}
	}
	const plate = await loadImage(lowerThird)
	const output = document.createElement("canvas")
	output.width = width
	output.height = height
	const ctx = output.getContext("2d", { alpha: false })
	if (!ctx) {
		throw Error("Missing chapter output canvas")
	}

	// Retain the original camera move for an unrigged picture. A moving subject has a fixed camera.
	const drawShot = async (index: number, frame: number) => {
		const beat = plan.beats[index]
		if (!beat) {
			throw Error("Unknown film shot")
		}
		const track = plan.videoSceneImages.find(
			(image) => image.sourceImageHash === beat.sourceImageHash,
		)?.animationFileHash
		const motion = track ? animations.get(track) : undefined
		if (motion) {
			return drawAnimation(ctx, motion, frame - beat.start)
		}
		const photo = photos.get(beat.sourceImageHash)
		if (!photo) {
			throw Error("Missing approved photograph")
		}
		const progress = Math.min(1, (frame - beat.start) / Math.max(1, beat.end - beat.start + 9))
		const { zoom, x } = cameraPosition(beat.move, progress)
		picture.scale.set(zoom, zoom, 1)
		picture.position.x = x
		material.map = photo
		material.needsUpdate = true
		gl.render(stage, camera)
		ctx.drawImage(gl.domElement, 0, 0)
	}

	// Crossfade existing shots on the montage grid. Attribution and fades use absolute chapter time.
	window.drawVideoScene = async (frame) => {
		if (!Number.isInteger(frame) || frame < 0 || frame >= plan.frameCount) {
			throw Error("Frame outside chapter")
		}
		const index = plan.beats.findIndex((beat) => frame < beat.end)
		const start = plan.beats[index]?.start
		if (start === undefined) {
			throw Error("No shot at the requested frame")
		}
		ctx.globalAlpha = 1
		await drawShot(index, frame)
		if (index > 0 && frame - start < 10) {
			ctx.globalAlpha = 1 - (frame - start) / 10
			await drawShot(index - 1, frame)
		}
		const seconds = frame / fps
		if (seconds >= 0.6 && seconds < 8) {
			ctx.globalAlpha = Math.min(1, (seconds - 0.6) / 0.4, (8 - seconds) / 0.4)
			ctx.drawImage(plate, 0, 0)
		}
		const fade = Math.min(7, plan.frameCount / 2)
		const edge = Math.min(frame, plan.frameCount - 1 - frame)
		if (edge < fade) {
			ctx.globalAlpha = 1 - edge / fade
			ctx.fillStyle = espresso
			ctx.fillRect(0, 0, width, height)
		}
		ctx.globalAlpha = 1
		const jpeg = output.toDataURL("image/jpeg", 0.96)
		return jpeg.slice(jpeg.indexOf(",") + 1)
	}
}
