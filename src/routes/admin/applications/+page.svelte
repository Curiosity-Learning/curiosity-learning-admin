<script lang="ts">
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { routes } from '$lib/routes';

	// CL-732 (PRD 6.14.3): applications pipeline — status counts plus the in-flight and decided
	// lists. Each row links to the review page (./[applicationId]) where staff watch the video,
	// accept/decline, and chat with the applicant. Decided applications stay listed because their
	// chat deliberately remains open (CL-710 CEO review item 4).
	//
	// CL-778: filtered by season, server-side. 'current' (the default) is the season whose review
	// window is open now, else the next one to open; the backend resolves it and echoes the
	// resolved season back as `selectedSeason`. A season's list is its submitted applications whose
	// "Season for review" is that season plus the incomplete ones started in it. 'none' lists
	// applications without a season link so staff can place them.
	type SeasonFilter = 'current' | 'all' | 'none' | Id<'seasons'>;
	type SeasonOption = { seasonId: Id<'seasons'>; name: string; startDate: number };
	let seasonFilter = $state<SeasonFilter>('current');
	const pipelineResponse = useStableQuery(api.admin.adminApplicationsPipeline, () => ({
		season: seasonFilter
	}));
	let pipeline = $derived(pipelineResponse.data ?? null);
	let seasonOptions = $derived((pipeline?.seasons ?? []) as SeasonOption[]);
	// The select shows the resolved season once 'current' has been answered.
	let selectedSeason = $derived(
		seasonFilter === 'current'
			? ((pipeline?.selectedSeason as SeasonFilter | undefined) ?? '')
			: seasonFilter
	);
	let selectedSeasonName = $derived(
		selectedSeason === 'all'
			? 'All seasons'
			: selectedSeason === 'none'
				? 'No season'
				: (seasonOptions.find((season) => season.seasonId === selectedSeason)?.name ?? null)
	);
	let items = $derived(pipeline?.items ?? []);
	let decidedItems = $derived(pipeline?.decidedItems ?? []);
	// Decided applications' chats stay open, so replies can land there too — count both lists.
	let awaitingReplyCount = $derived(
		[...items, ...decidedItems].filter((item) => item.chatAwaitingReply).length
	);

	const statusLabel: Record<string, string> = {
		incomplete: 'Incomplete',
		pending: 'Pending',
		interview: 'Interview',
		accepted: 'Accepted',
		rejected: 'Rejected',
		finalized: 'Finalized'
	};

	const statusOrder = ['incomplete', 'pending', 'interview', 'accepted', 'rejected'] as const;

	const formatDate = (value: number) => new Date(value).toLocaleDateString();

	const onSeasonChange = (event: Event) => {
		seasonFilter = (event.currentTarget as HTMLSelectElement).value as SeasonFilter;
	};
</script>

{#snippet seasonCell(item: {
	status: string;
	startedSeasonName: string | null;
	reviewSeasonName: string | null;
})}
	<td class="px-3 py-2 text-xs text-neutral-600">
		<p>
			<span class="text-neutral-400">Started:</span>
			{item.startedSeasonName ?? 'No season'}
		</p>
		{#if item.status !== 'incomplete'}
			<p>
				<span class="text-neutral-400">Review:</span>
				{item.reviewSeasonName ?? 'No season'}
			</p>
		{/if}
	</td>
{/snippet}

<div class="flex flex-col gap-6">
	<div>
		<div class="flex flex-wrap items-end justify-between gap-3">
			<h1 class="text-xl font-semibold">Applications</h1>
			<label class="flex items-center gap-2 text-sm text-neutral-600">
				Season for review
				<select
					value={selectedSeason}
					onchange={onSeasonChange}
					class="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
				>
					{#each seasonOptions as season (season.seasonId)}
						<option value={season.seasonId}>{season.name}</option>
					{/each}
					<option value="none">No season</option>
					<option value="all">All seasons</option>
				</select>
			</label>
		</div>
		<p class="mt-1 text-sm text-neutral-500">
			Club application pipeline. Open an application to review it, decide, and chat with the
			applicant.
			{#if selectedSeasonName && selectedSeason !== 'all'}
				Showing {selectedSeasonName}: applications submitted for review in this season, plus
				incomplete ones started in it.
			{/if}
		</p>
		{#if awaitingReplyCount > 0}
			<p class="mt-2 text-sm font-medium text-neutral-900">
				{awaitingReplyCount}
				{awaitingReplyCount === 1 ? 'conversation is' : 'conversations are'} waiting for a reply — look
				for the <Badge>Reply waiting</Badge> rows below.
			</p>
		{/if}
	</div>

	{#if pipelineResponse.isLoading}
		<p class="text-sm text-neutral-500">Loading...</p>
	{:else if pipeline}
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
			{#each statusOrder as status (status)}
				<div class="rounded border border-neutral-300 bg-white p-3">
					<p class="text-xl font-semibold">{pipeline.statusCounts[status]}</p>
					<p class="text-xs text-neutral-500">{statusLabel[status]}</p>
				</div>
			{/each}
		</div>

		<div>
			<h2 class="text-sm font-semibold text-neutral-600">
				In-flight applications ({items.length})
			</h2>
			{#if items.length === 0}
				<p
					class="mt-2 rounded border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500"
				>
					Nothing in flight.
				</p>
			{:else}
				<div class="mt-2 overflow-x-auto rounded border border-neutral-200 bg-white">
					<table class="w-full text-left text-sm">
						<thead class="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
							<tr>
								<th class="px-3 py-2">Name</th>
								<th class="px-3 py-2">Applicant</th>
								<th class="px-3 py-2">Status</th>
								<th class="px-3 py-2">Season</th>
								<th class="px-3 py-2">Chat</th>
								<th class="px-3 py-2">Created</th>
								<th class="px-3 py-2">Reviews</th>
								<th class="px-3 py-2">Avg score</th>
								<th class="px-3 py-2">Flags</th>
							</tr>
						</thead>
						<tbody>
							{#each items as item (item.applicationId)}
								<tr class="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
									<td class="px-3 py-2 font-medium">
										<a
											class="text-neutral-900 underline-offset-2 hover:underline"
											href={routes.adminApplication(item.applicationId)}
										>
											{item.name}
										</a>
									</td>
									<td class="px-3 py-2 text-neutral-600">
										<p>{item.applicantName ?? '—'}</p>
										{#if item.applicantEmail}
											<a
												class="text-xs text-neutral-500 underline-offset-2 hover:underline"
												href={`mailto:${item.applicantEmail}`}
											>
												{item.applicantEmail}
											</a>
										{/if}
									</td>
									<td class="px-3 py-2 capitalize">{statusLabel[item.status]}</td>
									{@render seasonCell(item)}
									<td class="px-3 py-2">
										{#if item.chatAwaitingReply}
											<Badge>Reply waiting</Badge>
										{:else if item.chatLastMessageAt}
											<span class="text-xs text-neutral-500">
												Last: {formatDate(item.chatLastMessageAt)}
											</span>
										{:else}
											<span class="text-neutral-400">—</span>
										{/if}
									</td>
									<td class="px-3 py-2 text-neutral-600">{formatDate(item.createdAt)}</td>
									<td class="px-3 py-2">{item.reviewCount}</td>
									<td class="px-3 py-2"
										>{item.avgScore === null ? '—' : item.avgScore.toFixed(1)}</td
									>
									<td class="px-3 py-2">
										<div class="flex flex-wrap gap-1">
											{#if item.scoreDiscrepancyFlag}
												<Badge variant="destructive">Score discrepancy</Badge>
											{/if}
											{#if item.adminFollowUpFlag}
												<Badge variant="secondary" title={item.adminFollowUpFlag.reason}>
													Follow-up
												</Badge>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<div>
			<h2 class="text-sm font-semibold text-neutral-600">
				Decided applications ({decidedItems.length})
			</h2>
			{#if decidedItems.length === 0}
				<p
					class="mt-2 rounded border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500"
				>
					No decisions yet.
				</p>
			{:else}
				<div class="mt-2 overflow-x-auto rounded border border-neutral-200 bg-white">
					<table class="w-full text-left text-sm">
						<thead class="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
							<tr>
								<th class="px-3 py-2">Name</th>
								<th class="px-3 py-2">Applicant</th>
								<th class="px-3 py-2">Decision</th>
								<th class="px-3 py-2">Season</th>
								<th class="px-3 py-2">Decided</th>
								<th class="px-3 py-2">Chat</th>
								<th class="px-3 py-2">Club</th>
								<th class="px-3 py-2">Flags</th>
							</tr>
						</thead>
						<tbody>
							{#each decidedItems as item (item.applicationId)}
								<tr class="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
									<td class="px-3 py-2 font-medium">
										<a
											class="text-neutral-900 underline-offset-2 hover:underline"
											href={routes.adminApplication(item.applicationId)}
										>
											{item.name}
										</a>
									</td>
									<td class="px-3 py-2 text-neutral-600">
										<p>{item.applicantName ?? '—'}</p>
										{#if item.applicantEmail}
											<a
												class="text-xs text-neutral-500 underline-offset-2 hover:underline"
												href={`mailto:${item.applicantEmail}`}
											>
												{item.applicantEmail}
											</a>
										{/if}
									</td>
									<td class="px-3 py-2">
										<Badge variant={item.status === 'accepted' ? 'secondary' : 'outline'}>
											{statusLabel[item.status]}
										</Badge>
									</td>
									{@render seasonCell(item)}
									<td class="px-3 py-2 text-neutral-600">
										{item.decidedAt ? formatDate(item.decidedAt) : '—'}
									</td>
									<td class="px-3 py-2">
										{#if item.chatAwaitingReply}
											<Badge>Reply waiting</Badge>
										{:else if item.chatLastMessageAt}
											<span class="text-xs text-neutral-500">
												Last: {formatDate(item.chatLastMessageAt)}
											</span>
										{:else}
											<span class="text-neutral-400">—</span>
										{/if}
									</td>
									<td class="px-3 py-2 text-neutral-600">{item.clubName ?? '—'}</td>
									<td class="px-3 py-2">
										{#if item.adminFollowUpFlag}
											<Badge variant="secondary" title={item.adminFollowUpFlag.reason}>
												Follow-up
											</Badge>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
</div>
