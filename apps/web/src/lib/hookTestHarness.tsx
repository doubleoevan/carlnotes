import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Window } from "happy-dom"
import { act, type ReactNode } from "react"
import { createRoot } from "react-dom/client"

// the harness owns its DOM globals, root, and Query client for one hook test
export type HookTestHarness<State> = {
	client: QueryClient
	container: HTMLElement
	read: () => State
	render: (hook?: () => State) => Promise<void>
	close: () => Promise<void>
}

/**
 * Mounts a live React hook in a disposable browser-owned test environment.
 */
export async function renderTestHook<State>(
	hook: () => State,
	renderState?: (state: State) => ReactNode,
): Promise<HookTestHarness<State>> {
	// save every replaced global for the next test file
	const window = new Window()
	const replacements = {
		window,
		document: window.document,
		navigator: window.navigator,
		IS_REACT_ACT_ENVIRONMENT: true,
	}
	const descriptors = new Map(
		Object.keys(replacements).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
	)
	for (const [name, replacement] of Object.entries(replacements)) {
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: replacement })
	}

	// render through a real Query provider and retain the latest hook return
	const container = window.document.createElement("div")
	window.document.body.append(container)
	const root = createRoot(container as unknown as HTMLElement)
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
	})
	let currentHook = hook
	let state: State
	function Observer() {
		state = currentHook()
		return renderState?.(state) ?? null
	}
	const render = async (nextHook = currentHook): Promise<void> => {
		currentHook = nextHook
		await act(async () =>
			root.render(
				<QueryClientProvider client={client}>
					<Observer />
				</QueryClientProvider>,
			),
		)
	}
	await render()
	return {
		client,
		container: container as unknown as HTMLElement,
		read: () => state,
		render,
		close: async () => {
			// unmount before restoring globals used by React's cleanup
			await act(async () => {
				root.unmount()
				await client.cancelQueries()
				client.clear()
				// drain queued Query notifications while the DOM still exists
				await new Promise((resolve) => setTimeout(resolve, 5))
			})
			for (const [name, descriptor] of descriptors) {
				if (descriptor) {
					Object.defineProperty(globalThis, name, descriptor)
				} else {
					Reflect.deleteProperty(globalThis, name)
				}
			}
			await window.happyDOM.close()
		},
	}
}

/**
 * Waits for React and Query notifications to satisfy a bounded assertion.
 */
export async function waitForHook(predicate: () => boolean): Promise<void> {
	const deadline = Date.now() + 2000
	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error("hook did not reach the expected state")
		}
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5))
		})
	}
}
