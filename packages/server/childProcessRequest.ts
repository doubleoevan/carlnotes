// one request sent to a Bun child process of its own, which says it is ready, replies once, and is stopped. the child
// process's script sends { status: "ready" } over ipc, then reads the request and sends its reply

// the reply that a child process sends before its request
type ReadyReply = { status: "ready" }

// a child process's script, what it is sent, and the limits and errors of its run
type RunChildProcessRequestOptions<Request, Reply, Result> = {
	// the script, its request, its environment, how long it may run, and the signal that stops it
	scriptPath: string
	request: Request
	env: Record<string, string>
	timeLimitMs: number
	killSignal?: NodeJS.Signals

	// what a reply settles with, the errors of the time limit and the exit, and a step after the spawn
	toResult: (reply: Reply) => Result
	toTimeLimitError: () => Error
	toExitError: (exitedProcess: { exitCode: number; signalCode: Bun.Subprocess["signalCode"] }) => Error
	afterSpawn?: (childProcess: Bun.Subprocess) => void
}

/**
 * Starts the script in a child process with the runtime this process runs on, sends the request once the child process
 * is ready, and returns what toResult makes of its reply. The child process is stopped however the run ends. Rejects
 * with the error toResult throws, the error of a request that cannot be sent, toTimeLimitError's error if the time
 * limit passes, and toExitError's error if the child process exits with no reply.
 */
export function runChildProcessRequest<Request, Reply, Result>(
	runOptions: RunChildProcessRequestOptions<Request, Reply, Result>,
): Promise<Result> {
	// the request, and what the reply, the time limit, and the exit settle with
	const { request, toResult, toTimeLimitError, toExitError } = runOptions
	return new Promise((resolve, reject) => {
		// settle with whichever comes first: the reply, the time limit, or the exit
		let isSettled = false
		const settle = (settlePromise: () => void): void => {
			if (isSettled) {
				return
			}

			// stop the timer and the child process
			isSettled = true
			clearTimeout(timeLimitTimer)
			childProcess.kill(runOptions.killSignal)
			settlePromise()
		}

		// send the request once the child process is ready for it. a request that cannot be sent rejects
		const sendRequest = (): void => {
			try {
				childProcess.send(request)
			} catch (error) {
				settle(() => reject(error instanceof Error ? error : new Error(String(error))))
			}
		}

		// settle with what toResult makes of the reply, or with the error it throws
		const settleWithReply = (reply: Reply): void =>
			settle(() => {
				try {
					resolve(toResult(reply))
				} catch (error) {
					reject(error)
				}
			})

		// the child process says it is ready, then replies, or exits without a reply
		const childProcess = Bun.spawn([process.execPath, runOptions.scriptPath], {
			env: runOptions.env,
			stdio: ["ignore", "inherit", "inherit"],
			serialization: "advanced",
			ipc: (reply: ReadyReply | Reply) => (isReadyReply(reply) ? sendRequest() : settleWithReply(reply)),
		})

		// a child process still running at its time limit is stopped
		const timeLimitTimer = setTimeout(() => settle(() => reject(toTimeLimitError())), runOptions.timeLimitMs)
		runOptions.afterSpawn?.(childProcess)

		// the exit is read from the child process's promise, which settles after the timer and the child process are
		// set. an exit callback may run before the spawn returns
		void childProcess.exited.then((exitCode) =>
			settle(() => reject(toExitError({ exitCode, signalCode: childProcess.signalCode }))),
		)
	})
}

// whether a child process's message says it is ready for its request
function isReadyReply(reply: unknown): reply is ReadyReply {
	return (reply as ReadyReply).status === "ready"
}

/**
 * Returns a child process's environment: the folder its temporary files go to, and each named setting that this
 * process has. A child process gets no other part of this process's environment, which holds every secret.
 */
export function toChildProcessEnvironment(
	temporaryFolder: string,
	settingNames: readonly string[],
): Record<string, string> {
	const childProcessEnvironment: Record<string, string> = { TMPDIR: temporaryFolder }

	// pass each setting on that this process has
	for (const settingName of settingNames) {
		const setting = Bun.env[settingName]
		if (setting) {
			childProcessEnvironment[settingName] = setting
		}
	}
	return childProcessEnvironment
}
