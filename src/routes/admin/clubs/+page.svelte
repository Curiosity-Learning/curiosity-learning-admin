<script lang="ts">
	import { api } from '$convex/_generated/api';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';

	// CL-732 (PRD 6.14.2): per-club health table. Filters are client-side (status, CoC group,
	// has-flags, location text) since `adminClubsHealth` returns every curiosity club in one
	// shot — fine at current data volume, matches the rest of this admin app's precedent.
	const rowsResponse = useStableQuery(api.admin.adminClubsHealth, {});
	let rows = $derived(rowsResponse.data ?? []);

	type Row = NonNullable<typeof rowsResponse.data>[number];
	type SortKey =
		| 'name'
		| 'guideCount'
		| 'learnerCount'
		| 'sessionsRun'
		| 'attendanceRate'
		| 'activeProjectCount'
		| 'lastActivityAt'
		| 'qualityRating'
		| 'status';

	let statusFilter = $state<'all' | 'active' | 'abandoned'>('all');
	let cocGroupFilter = $state<string>('all');
	let hasFlagsOnly = $state(false);
	let locationFilter = $state('');
	let sortKey = $state<SortKey>('name');
	let sortAsc = $state(true);

	const cocGroupOptions = $derived(
		Array.from(
			new Map(
				rows
					.filter((row: Row) => row.cocGroupId)
					.map((row: Row) => [
						row.cocGroupId as string,
						row.cocGroupName ?? (row.cocGroupId as string)
					])
			).entries()
		)
	);

	const filteredRows = $derived(
		rows.filter((row: Row) => {
			if (statusFilter !== 'all' && row.status !== statusFilter) return false;
			if (cocGroupFilter !== 'all' && row.cocGroupId !== cocGroupFilter) return false;
			if (hasFlagsOnly && row.flags.length === 0) return false;
			if (locationFilter.trim()) {
				const needle = locationFilter.trim().toLowerCase();
				if (!row.location?.toLowerCase().includes(needle)) return false;
			}
			return true;
		})
	);

	const compareNullableNumber = (a: number | null, b: number | null) => {
		if (a === null && b === null) return 0;
		if (a === null) return -1;
		if (b === null) return 1;
		return a - b;
	};

	const sortedRows = $derived(
		[...filteredRows].sort((a: Row, b: Row) => {
			let cmp = 0;
			switch (sortKey) {
				case 'name':
					cmp = a.name.localeCompare(b.name);
					break;
				case 'guideCount':
					cmp = a.guideCount - b.guideCount;
					break;
				case 'learnerCount':
					cmp = a.learnerCount - b.learnerCount;
					break;
				case 'sessionsRun':
					cmp = a.sessionsRun - b.sessionsRun;
					break;
				case 'attendanceRate':
					cmp = compareNullableNumber(a.attendanceRate, b.attendanceRate);
					break;
				case 'activeProjectCount':
					cmp = a.activeProjectCount - b.activeProjectCount;
					break;
				case 'lastActivityAt':
					cmp = compareNullableNumber(a.lastActivityAt, b.lastActivityAt);
					break;
				case 'qualityRating':
					cmp = compareNullableNumber(a.qualityRating, b.qualityRating);
					break;
				case 'status':
					cmp = a.status.localeCompare(b.status);
					break;
			}
			return sortAsc ? cmp : -cmp;
		})
	);

	const toggleSort = (key: SortKey) => {
		if (sortKey === key) {
			sortAsc = !sortAsc;
		} else {
			sortKey = key;
			sortAsc = true;
		}
	};

	const sortIndicator = (key: SortKey) => (sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : '');

	const flagLabel: Record<string, string> = {
		abandoned: 'Abandoned',
		no_sessions_yet: 'No sessions yet',
		low_quality: 'Low quality',
		inactive: 'Inactive'
	};

	const formatPercent = (value: number | null) =>
		value === null ? '—' : `${Math.round(value * 100)}%`;

	const formatDate = (value: number | null) =>
		value === null ? '—' : new Date(value).toLocaleDateString();
</script>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-xl font-semibold">Clubs</h1>
		<p class="mt-1 text-sm text-neutral-500">
			{filteredRows.length} of {rows.length} curiosity clubs
		</p>
	</div>

	<div class="flex flex-wrap items-end gap-3">
		<label class="flex flex-col gap-1 text-xs text-neutral-500">
			Status
			<select bind:value={statusFilter} class="rounded border border-neutral-300 px-2 py-1 text-sm">
				<option value="all">All</option>
				<option value="active">Active</option>
				<option value="abandoned">Abandoned</option>
			</select>
		</label>

		<label class="flex flex-col gap-1 text-xs text-neutral-500">
			CoC group
			<select
				bind:value={cocGroupFilter}
				class="rounded border border-neutral-300 px-2 py-1 text-sm"
			>
				<option value="all">All</option>
				{#each cocGroupOptions as [id, name] (id)}
					<option value={id}>{name}</option>
				{/each}
			</select>
		</label>

		<label class="flex flex-col gap-1 text-xs text-neutral-500">
			Location contains
			<Input bind:value={locationFilter} placeholder="e.g. Nairobi" class="h-8 w-40 text-sm" />
		</label>

		<label class="flex items-center gap-2 pb-1 text-sm text-neutral-700">
			<input type="checkbox" bind:checked={hasFlagsOnly} />
			Has flags only
		</label>
	</div>

	<!-- Location filter is a simple text match, not structured country parsing — free-text
	     location strings on `clubs` can't be reliably parsed into countries, so this diverges
	     from a "country" filter one might expect from the PRD. -->

	{#if rowsResponse.isLoading}
		<p class="text-sm text-neutral-500">Loading...</p>
	{:else if sortedRows.length === 0}
		<p
			class="rounded border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500"
		>
			No clubs match these filters.
		</p>
	{:else}
		<div class="overflow-x-auto rounded border border-neutral-200 bg-white">
			<table class="w-full text-left text-sm">
				<thead class="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
					<tr>
						<th class="cursor-pointer px-3 py-2" onclick={() => toggleSort('name')}>
							Name{sortIndicator('name')}
						</th>
						<th class="px-3 py-2">Location</th>
						<th class="px-3 py-2">CoC group</th>
						<th class="cursor-pointer px-3 py-2" onclick={() => toggleSort('guideCount')}>
							Guides{sortIndicator('guideCount')}
						</th>
						<th class="cursor-pointer px-3 py-2" onclick={() => toggleSort('learnerCount')}>
							Learners{sortIndicator('learnerCount')}
						</th>
						<th class="cursor-pointer px-3 py-2" onclick={() => toggleSort('sessionsRun')}>
							Sessions run{sortIndicator('sessionsRun')}
						</th>
						<th class="cursor-pointer px-3 py-2" onclick={() => toggleSort('attendanceRate')}>
							Attendance{sortIndicator('attendanceRate')}
						</th>
						<th class="cursor-pointer px-3 py-2" onclick={() => toggleSort('activeProjectCount')}>
							Active projects{sortIndicator('activeProjectCount')}
						</th>
						<th class="cursor-pointer px-3 py-2" onclick={() => toggleSort('lastActivityAt')}>
							Last activity{sortIndicator('lastActivityAt')}
						</th>
						<th class="cursor-pointer px-3 py-2" onclick={() => toggleSort('qualityRating')}>
							Quality{sortIndicator('qualityRating')}
						</th>
						<th class="cursor-pointer px-3 py-2" onclick={() => toggleSort('status')}>
							Status{sortIndicator('status')}
						</th>
						<th class="px-3 py-2">Flags</th>
					</tr>
				</thead>
				<tbody>
					{#each sortedRows as row (row.clubId)}
						<tr class="border-b border-neutral-100 last:border-0">
							<td class="px-3 py-2 font-medium">{row.name}</td>
							<td class="px-3 py-2 text-neutral-600">{row.location ?? '—'}</td>
							<td class="px-3 py-2 text-neutral-600">{row.cocGroupName ?? '—'}</td>
							<td class="px-3 py-2">{row.guideCount}</td>
							<td class="px-3 py-2">{row.learnerCount}</td>
							<td class="px-3 py-2">{row.sessionsRun}</td>
							<td class="px-3 py-2">{formatPercent(row.attendanceRate)}</td>
							<td class="px-3 py-2">{row.activeProjectCount}</td>
							<td class="px-3 py-2">{formatDate(row.lastActivityAt)}</td>
							<td class="px-3 py-2"
								>{row.qualityRating === null ? '—' : row.qualityRating.toFixed(1)}</td
							>
							<td class="px-3 py-2 capitalize">{row.status}</td>
							<td class="px-3 py-2">
								<div class="flex flex-wrap gap-1">
									{#each row.flags as flag (flag)}
										<Badge
											variant={flag === 'low_quality' || flag === 'abandoned'
												? 'destructive'
												: 'secondary'}
										>
											{flagLabel[flag] ?? flag}
										</Badge>
									{/each}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
