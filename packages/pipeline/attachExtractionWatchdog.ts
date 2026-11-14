// the thread that ends an extraction's child process once the process's resident memory passes its limit. it runs
// apart from the thread that reads the file, which a parser may hold for seconds without a pause

// the thread's own global scope, which receives the limit and says once it is watching
declare const self: Worker

// how often the process's resident memory is read, in milliseconds
const MEMORY_CHECK_INTERVAL_MS = 10

// take the limit in bytes, and kill the process the first time its resident memory is past it. the process that
// started the child process reads the kill as the memory limit
self.onmessage = ({ data: memoryLimitBytes }: MessageEvent<number>) => {
	const endProcessPastLimit = (): void => {
		if (process.memoryUsage.rss() > memoryLimitBytes) {
			process.kill(process.pid, "SIGKILL")
		}
	}

	// read the memory once before the file is read, then on every interval
	endProcessPastLimit()
	setInterval(endProcessPastLimit, MEMORY_CHECK_INTERVAL_MS)
	self.postMessage("watching")
}
