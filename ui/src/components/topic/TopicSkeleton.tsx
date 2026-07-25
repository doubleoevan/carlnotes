// placeholder keys for the skeleton's finding rows, history rows, and info card sections
const FINDING_SKELETONS = ["f1", "f2", "f3", "f4", "f5"]
const SCAN_SKELETONS = ["s1", "s2"]
const CARD_SKELETONS = ["prompt", "sources", "schedule", "visibility"]

// the loading state for the body below the static controls: header, findings, then history and the card
export function TopicSkeleton() {
	return (
		<div aria-hidden="true">
			{/* title row with the unread count, seated where the real title lands */}
			<div className="mt-10 flex items-start justify-between gap-3">
				<div className="bg-muted h-8 w-96 max-w-full animate-pulse rounded" />
				<div className="bg-muted h-5 w-14 shrink-0 animate-pulse rounded" />
			</div>

			{/* tags row placeholders, at the real pills' height */}
			<div className="mt-2 flex min-h-7 items-center gap-1">
				<div className="bg-muted h-5.5 w-28 animate-pulse rounded-full" />
				<div className="bg-muted h-5.5 w-24 animate-pulse rounded-full" />
				<div className="bg-muted h-5.5 w-20 animate-pulse rounded-full" />
			</div>

			{/* findings header at the accordion trigger's padding, then rows and the expander line */}
			<div className="mt-4 flex items-center gap-2 py-2">
				<div className="bg-muted size-4 animate-pulse rounded" />
				<div className="bg-muted h-7 w-24 animate-pulse rounded" />
			</div>
			<div className="divide-separator divide-y divide-dashed">
				{FINDING_SKELETONS.map((row) => (
					<div key={row} className="flex items-start gap-2.5 py-3">
						<div className="bg-muted mt-0.5 size-4 shrink-0 animate-pulse rounded" />
						<div className="min-w-0 flex-1">
							<div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
							<div className="bg-muted mt-2.5 h-3 w-2/5 animate-pulse rounded" />
						</div>
					</div>
				))}
			</div>
			<div className="mt-1 flex min-h-9 items-center">
				<div className="bg-muted h-4 w-16 animate-pulse rounded" />
			</div>

			{/* history header and rows left, the bordered info card right */}
			<div className="mt-2 grid gap-x-8 lg:grid-cols-[minmax(0,1fr)_32rem]">
				<div>
					<div className="flex items-center gap-2 py-2">
						<div className="bg-muted size-4 animate-pulse rounded" />
						<div className="bg-muted h-7 w-20 animate-pulse rounded" />
					</div>
					<div className="divide-separator divide-y divide-dashed">
						{SCAN_SKELETONS.map((row) => (
							<div key={row} className="flex items-center gap-3 py-4">
								<div className="bg-muted h-4 w-28 animate-pulse rounded" />
								<div className="bg-muted h-3 w-24 animate-pulse rounded" />
							</div>
						))}
					</div>
				</div>
				{/* the info card outline with its label and text bars, split by dashed rules */}
				<div className="divide-separator border-separator mt-2 h-fit divide-y divide-dashed rounded-lg border p-5">
					{CARD_SKELETONS.map((block) => (
						<div key={block} className="py-3 first:pt-0 last:pb-0">
							<div className="bg-muted h-3.5 w-24 animate-pulse rounded" />
							<div className="bg-muted mt-2 h-4 w-full animate-pulse rounded" />
						</div>
					))}
				</div>
			</div>
		</div>
	)
}
