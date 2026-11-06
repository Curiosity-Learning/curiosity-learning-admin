<script lang="ts">
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { BarChart } from 'layerchart';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { normalizeReferralSource, referralSourceLabel } from '$lib/referral-sources';
	import { SvelteMap } from 'svelte/reactivity';

	// CL-778: applications are grouped by the seasons they are linked to in the backend —
	// "Season started" (startedSeasonId: the season taking applications when the applicant began)
	// and "Season for review" (reviewSeasonId: the season taking applications when they submitted)
	// — instead of the former month-based cohort rule. Season names and order come from the seasons
	// table; applications without a link are counted under "No season".
	type ApplicationStatus = 'incomplete' | 'pending' | 'interview' | 'accepted' | 'rejected';
	type AnalyticsRow = {
		createdAt: number;
		status: ApplicationStatus;
		referralSource: string | null;
		referralOther: string | null;
		startedSeasonId: Id<'seasons'> | null;
		reviewSeasonId: Id<'seasons'> | null;
	};
	type SeasonRow = {
		_id: Id<'seasons'>;
		name: string;
		startDate: number;
		applicationDeadline?: number;
	};

	// Grouping and each-block keys are season ids (never names: two seasons may share a name),
	// with this fixed sentinel for applications without a season link.
	const NO_SEASON = '__no_season__';
	const NO_SEASON_LABEL = 'No season';

	const response = useStableQuery(api.admin.adminAnalyticsApplications, {});
	const seasonsResponse = useStableQuery(api.seasons.adminListSeasons, {});

	const formatDate = (value: number) =>
		new Date(value).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});

	// Count axes: whole numbers only.
	const intTick = (value: number) => (Number.isInteger(value) ? String(value) : '');
	let rows = $derived((response.data ?? null) as AnalyticsRow[] | null);
	// adminListSeasons: newest start first.
	let seasons = $derived((seasonsResponse.data ?? []) as SeasonRow[]);
	let chronologicalSeasons = $derived([...seasons].sort((a, b) => a.startDate - b.startDate));
	// Display name per season id; a name shared by several seasons gets its start date added so
	// chart bars and table rows stay distinguishable.
	let seasonDisplayNames = $derived.by(() => {
		const nameCounts = new SvelteMap<string, number>();
		for (const season of seasons)
			nameCounts.set(season.name, (nameCounts.get(season.name) ?? 0) + 1);
		const names = new SvelteMap<string, string>();
		for (const season of seasons) {
			names.set(
				season._id,
				(nameCounts.get(season.name) ?? 0) > 1
					? `${season.name} (${formatDate(season.startDate)})`
					: season.name
			);
		}
		return names;
	});

	const seasonLabel = (key: string) =>
		key === NO_SEASON ? NO_SEASON_LABEL : (seasonDisplayNames.get(key) ?? 'Unknown season');

	// Season picker: every season (newest first), plus "No season" when some application has no
	// started season.
	let pickerOptions = $derived.by(() => {
		const options = seasons.map((season) => ({
			key: season._id as string,
			label: seasonDisplayNames.get(season._id) ?? season.name
		}));
		if (rows?.some((row) => !row.startedSeasonId)) {
			options.push({ key: NO_SEASON, label: NO_SEASON_LABEL });
		}
		return options;
	});

	// Default to the season taking applications right now (earliest deadline still ahead), falling
	// back to the newest season; the admin's pick wins once made.
	let pickedKey = $state<string | null>(null);
	const now = Date.now();
	let defaultKey = $derived.by(() => {
		const intake = seasons
			.filter(
				(season) => season.applicationDeadline !== undefined && season.applicationDeadline > now
			)
			.sort((a, b) => (a.applicationDeadline ?? 0) - (b.applicationDeadline ?? 0))[0];
		return intake?._id ?? pickerOptions[0]?.key ?? null;
	});
	let selectedKey = $derived(pickedKey ?? defaultKey);
	const onSeasonChange = (event: Event) => {
		pickedKey = (event.currentTarget as HTMLSelectElement).value;
	};
	let selectedSeason = $derived(seasons.find((season) => season._id === selectedKey) ?? null);
	let selectedLabel = $derived(selectedKey ? seasonLabel(selectedKey) : '');
	// The selected season's charts cover the applications STARTED in it.
	let selectedRows = $derived(
		rows && selectedKey
			? rows.filter((row) => (row.startedSeasonId ?? NO_SEASON) === selectedKey)
			: []
	);

	let selectedDescription = $derived(
		selectedSeason
			? [
					selectedSeason.applicationDeadline !== undefined
						? `Applications close ${formatDate(selectedSeason.applicationDeadline)}`
						: null,
					`season starts ${formatDate(selectedSeason.startDate)}`
				]
					.filter(Boolean)
					.join(' · ')
			: ''
	);

	// Chart 1: "Where you heard about us" for applications started in the selected season.
	let referralData = $derived.by(() => {
		const counts = new SvelteMap<string, number>();
		for (const row of selectedRows) {
			if (!row.referralSource) continue;
			const slug = normalizeReferralSource(row.referralSource);
			counts.set(slug, (counts.get(slug) ?? 0) + 1);
		}
		return [...counts.entries()]
			.map(([slug, count]) => ({ key: slug, label: referralSourceLabel(slug), count }))
			.sort((a, b) => b.count - a.count);
	});
	let referralAnswered = $derived(selectedRows.filter((row) => row.referralSource).length);
	let referralOtherTexts = $derived(
		selectedRows.map((row) => row.referralOther?.trim()).filter((text): text is string => !!text)
	);

	// Per-season counts in season order (by start date), "No season" last; seasons without any
	// applications are left out.
	const countPerSeason = (seasonIds: (Id<'seasons'> | null)[]) => {
		const counts = new SvelteMap<string, number>();
		for (const seasonId of seasonIds) {
			const key = seasonId ?? NO_SEASON;
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		const ordered = chronologicalSeasons
			.filter((season) => counts.has(season._id))
			.map((season) => ({
				key: season._id as string,
				label: seasonDisplayNames.get(season._id) ?? season.name,
				count: counts.get(season._id) ?? 0
			}));
		const known = new Set<string>(chronologicalSeasons.map((season) => season._id));
		const unknown = [...counts.entries()]
			.filter(([key]) => key !== NO_SEASON && !known.has(key))
			.reduce((sum, [, count]) => sum + count, 0);
		const none = (counts.get(NO_SEASON) ?? 0) + unknown;
		if (none > 0) ordered.push({ key: NO_SEASON, label: NO_SEASON_LABEL, count: none });
		return ordered;
	};

	// Chart 2: applications started per season (every application, by startedSeasonId).
	let startedPerSeasonData = $derived(
		rows ? countPerSeason(rows.map((row) => row.startedSeasonId)) : []
	);

	// Chart 3: applications in review per season (submitted ones, by reviewSeasonId).
	let reviewPerSeasonData = $derived(
		rows
			? countPerSeason(
					rows.filter((row) => row.status !== 'incomplete').map((row) => row.reviewSeasonId)
				)
			: []
	);

	// Chart 4: status breakdown for applications started in the selected season. Colors are
	// CVD-validated and identity is also carried by the category labels, never color alone.
	const STATUS_ORDER: ApplicationStatus[] = [
		'incomplete',
		'pending',
		'interview',
		'accepted',
		'rejected'
	];
	const STATUS_LABELS: Record<ApplicationStatus, string> = {
		incomplete: 'Incomplete',
		pending: 'Pending',
		interview: 'Interview',
		accepted: 'Accepted',
		rejected: 'Rejected'
	};
	const STATUS_COLORS = ['#b45309', '#0891b2', '#7c3aed', '#15803d', '#dc2626'];
	let statusData = $derived.by(() => {
		const counts: Record<ApplicationStatus, number> = {
			incomplete: 0,
			pending: 0,
			interview: 0,
			accepted: 0,
			rejected: 0
		};
		for (const row of selectedRows) counts[row.status] += 1;
		return STATUS_ORDER.map((status) => ({
			status,
			label: STATUS_LABELS[status],
			count: counts[status]
		}));
	});
</script>

<svelte:head>
	<title>Analytics – Curiosity Admin</title>
</svelte:head>

<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-xl font-semibold">Analytics</h1>
		{#if selectedDescription}
			<p class="mt-0.5 text-sm text-neutral-500">{selectedDescription}</p>
		{/if}
	</div>
	{#if pickerOptions.length > 0}
		<label class="flex items-center gap-2 text-sm text-neutral-600">
			Season
			<select
				value={selectedKey}
				onchange={onSeasonChange}
				class="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
			>
				{#each pickerOptions as option (option.key)}
					<option value={option.key}>{option.label}</option>
				{/each}
			</select>
		</label>
	{/if}
</div>

{#if response.isLoading}
	<p class="text-sm text-neutral-500">Loading...</p>
{:else if !rows || rows.length === 0}
	<p class="text-sm text-neutral-500">No applications yet.</p>
{:else}
	<div class="grid gap-4">
		<section class="rounded border border-neutral-300 bg-white p-4">
			<h2 class="text-sm font-semibold">Where you heard about us</h2>
			<p class="mt-0.5 text-xs text-neutral-500">
				{selectedLabel} · {referralAnswered} of {selectedRows.length} applications started in this season
				answered
			</p>
			{#if referralData.length === 0}
				<p class="mt-4 text-sm text-neutral-500">No answers for this season.</p>
			{:else}
				<div class="mt-3 h-72">
					<BarChart
						data={referralData}
						orientation="horizontal"
						y="label"
						x="count"
						series={[
							{ key: 'count', label: 'Applications', value: 'count', color: 'var(--color-primary)' }
						]}
						props={{ xAxis: { format: intTick }, bars: { strokeWidth: 0 } }}
						padding={{ left: 128 }}
					/>
				</div>
				<details class="mt-2 text-xs text-neutral-500">
					<summary class="cursor-pointer select-none">View as table</summary>
					<table class="mt-2 text-left">
						<thead
							><tr
								><th class="pr-6 font-medium">Source</th><th class="font-medium">Applications</th
								></tr
							></thead
						>
						<tbody>
							{#each referralData as row (row.key)}
								<tr><td class="pr-6">{row.label}</td><td>{row.count}</td></tr>
							{/each}
						</tbody>
					</table>
				</details>
				{#if referralOtherTexts.length > 0}
					<div class="mt-3 border-t border-neutral-200 pt-3">
						<p class="text-xs font-medium text-neutral-600">"Other" answers</p>
						<ul class="mt-1 list-inside list-disc text-xs text-neutral-500">
							{#each referralOtherTexts as text, index (index)}
								<li>{text}</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}
		</section>

		<div class="grid gap-4 lg:grid-cols-2">
			<section class="rounded border border-neutral-300 bg-white p-4">
				<h2 class="text-sm font-semibold">Applications started per season</h2>
				<p class="mt-0.5 text-xs text-neutral-500">
					All applications, by the season taking applications when they were started
				</p>
				<div class="mt-3 h-64">
					<BarChart
						data={startedPerSeasonData}
						x="label"
						y="count"
						series={[
							{ key: 'count', label: 'Applications', value: 'count', color: 'var(--color-primary)' }
						]}
						props={{ yAxis: { format: intTick }, bars: { strokeWidth: 0 } }}
					/>
				</div>
				<details class="mt-2 text-xs text-neutral-500">
					<summary class="cursor-pointer select-none">View as table</summary>
					<table class="mt-2 text-left">
						<thead
							><tr
								><th class="pr-6 font-medium">Season</th><th class="font-medium">Applications</th
								></tr
							></thead
						>
						<tbody>
							{#each startedPerSeasonData as row (row.key)}
								<tr><td class="pr-6">{row.label}</td><td>{row.count}</td></tr>
							{/each}
						</tbody>
					</table>
				</details>
			</section>

			<section class="rounded border border-neutral-300 bg-white p-4">
				<h2 class="text-sm font-semibold">Applications in review per season</h2>
				<p class="mt-0.5 text-xs text-neutral-500">
					Submitted applications, by their season for review
				</p>
				<div class="mt-3 h-64">
					<BarChart
						data={reviewPerSeasonData}
						x="label"
						y="count"
						series={[
							{ key: 'count', label: 'Applications', value: 'count', color: 'var(--color-primary)' }
						]}
						props={{ yAxis: { format: intTick }, bars: { strokeWidth: 0 } }}
					/>
				</div>
				<details class="mt-2 text-xs text-neutral-500">
					<summary class="cursor-pointer select-none">View as table</summary>
					<table class="mt-2 text-left">
						<thead
							><tr
								><th class="pr-6 font-medium">Season</th><th class="font-medium">Applications</th
								></tr
							></thead
						>
						<tbody>
							{#each reviewPerSeasonData as row (row.key)}
								<tr><td class="pr-6">{row.label}</td><td>{row.count}</td></tr>
							{/each}
						</tbody>
					</table>
				</details>
			</section>

			<section class="rounded border border-neutral-300 bg-white p-4">
				<h2 class="text-sm font-semibold">Application status</h2>
				<p class="mt-0.5 text-xs text-neutral-500">
					{selectedLabel} · {selectedRows.length} applications started in this season
				</p>
				<div class="mt-3 h-64">
					<BarChart
						data={statusData}
						orientation="horizontal"
						y="label"
						x="count"
						props={{ xAxis: { format: intTick }, bars: { strokeWidth: 0 } }}
						c="status"
						cDomain={STATUS_ORDER}
						cRange={STATUS_COLORS}
						padding={{ left: 80 }}
					/>
				</div>
				<details class="mt-2 text-xs text-neutral-500">
					<summary class="cursor-pointer select-none">View as table</summary>
					<table class="mt-2 text-left">
						<thead
							><tr
								><th class="pr-6 font-medium">Status</th><th class="font-medium">Applications</th
								></tr
							></thead
						>
						<tbody>
							{#each statusData as row (row.status)}
								<tr><td class="pr-6">{row.label}</td><td>{row.count}</td></tr>
							{/each}
						</tbody>
					</table>
				</details>
			</section>
		</div>
	</div>
{/if}
