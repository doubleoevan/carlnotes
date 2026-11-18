import { VIDEO_FRAMES_PER_SECOND } from "./videoTimeline"

// every run's H.264 settings. the same settings in every run let shots and parts join by stream copy, and a keyframe
// every two seconds that never moves for a scene change opens every run on a keyframe and keeps seeks fast
export const H264_ARGUMENTS = [
	"-c:v",
	"libx264",
	"-profile:v",
	"high",
	"-level",
	"4.0",
	"-pix_fmt",
	"yuv420p",
	"-r",
	String(VIDEO_FRAMES_PER_SECOND),
	"-preset",
	"veryfast",
	"-crf",
	"28",
	"-tune",
	"stillimage",
	"-maxrate",
	"1500k",
	"-bufsize",
	"3000k",
	"-g",
	String(VIDEO_FRAMES_PER_SECOND * 2),
	"-keyint_min",
	String(VIDEO_FRAMES_PER_SECOND * 2),
	"-sc_threshold",
	"0",
]
