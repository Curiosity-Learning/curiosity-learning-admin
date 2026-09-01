<script lang="ts">
	import { api } from '$convex/_generated/api';
	import { BarChart } from 'layerchart';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import {
		cohortSeasonForTimestamp,
		describeApplicationWindow,
		type CohortSeason
	} from '$lib/seasons';
	import { normalizeReferralSource, referralSourceLabel } from '$lib/referral-sources';
	import { SvelteMap } from 'svelte/reactivity';

	type ApplicationStatus = 'incomplete' | 'pending' | 'interview' | 'accepted' | 'rejected';
	type AnalyticsRow = {
		createdAt: number;
		status: ApplicationStatus;
		referralSource: string | null;
		referralOther: string | null;
	};

	const response = useStableQuery(api.admin.adminAnalyticsApplications, {});

	// Count axes: whole numbers only.
	const intTick = (value: number) => (Number.isInteger(value) ? String(value) : '');
	let rows = $derived((response.data ?? null) as AnalyticsRow[] | null);

	let bucketed = $derived(
		rows?.map((row) => ({ ...row, cohort: cohortSeasonForTimestamp(row.createdAt) })) ?? null
	);

	// Cohorts that actually have applications, newest first (for the season picker).
	let cohorts = $derived.by(() => {
		if (!bucketed) return null;
		const byKey = new SvelteMap<string, CohortSeason>();
		for (const row of bucketed) byKey.set(row.cohort.key, row.cohort);
		return [...byKey.values()].sort((a, b) => b.sortKey - a.sortKey);
	});

	// Default to the cohort whose application window is open right now, falling back to the
	// newest cohort with data.
	let selectedKey = $state<string | null>(null);
	$effect(() => {
		if (selectedKey !== null || !cohorts || cohorts.length === 0) return;
		const current = cohortSeasonForTimestamp(Date.now());
		selectedKey = cohorts.some((c) => c.key === current.key) ? current.key : cohorts[0].key;
	});
	let selected = $derived(cohorts?.find((c) => c.key === selectedKey) ?? null);
	let selectedRows = $derived(
		bucketed && selected ? bucketed.filter((row) => row.cohort.key === selected.key) : []
	);

	// Chart 1: "Where you heard about us" for the selected cohort.
	let referralData = $derived.by(() => {
		const counts = new SvelteMap<string, number>();
		for (const row of selectedRows) {
			if (!row.referralSource) continue;
			const slug = normalizeReferralSource(row.referralSource);
			counts.set(slug, (counts.get(slug) ?? 0) + 1);
		}
		return [...counts.entries()]
			.map(([slug, count]) => ({ label: referralSourceLabel(slug), count }))
			.sort((a, b) => b.count - a.count);
	});
	let referralAnswered = $derived(selectedRows.filter((row) => row.referralSource).length);
	let referralOtherTexts = $derived(
		selectedRows.map((row) => row.referralOther?.trim()).filter((text): text is string => !!text)
	);

	// Chart 2: applications per cohort, across all cohorts (chronological).
	let perCohortData = $derived.by(() => {
		if (!bucketed) return [];
		const counts = new SvelteMap<string, { cohort: CohortSeason; count: number }>();
		for (const row of bucketed) {
			const entry = counts.get(row.cohort.key) ?? { cohort: row.cohort, count: 0 };
			entry.count += 1;
			counts.set(row.cohort.key, entry);
		}
		return [...counts.values()]
			.sort((a, b) => a.cohort.sortKey - b.cohort.sortKey)
			.map((entry) => ({ label: entry.cohort.label, count: entry.count }));
	});

	// Chart 3: status breakdown for the selected cohort. Colors are CVD-validated and identity is
	// also carried by the category labels, never color alone.
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
		{#if selected}
			<p class="mt-0.5 text-sm text-neutral-500">{describeApplicationWindow(selected)}</p>
		{/if}
	</div>
	{#if cohorts && cohorts.length > 0}
		<label class="flex items-center gap-2 text-sm text-neutral-600">
			Season
			<select
				bind:value={selectedKey}
				class="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
			>
				{#each cohorts as cohort (cohort.key)}
					<option value={cohort.key}>{cohort.label}</option>
				{/each}
			</select>
		</label>
	{/if}
</div>

{#if response.isLoading}
	<p class="text-sm text-neutral-500">Loading...</p>
{:else if !bucketed || bucketed.length === 0}
	<p class="text-sm text-neutral-500">No applications yet.</p>
{:else}
	<div class="grid gap-4">
		<section class="rounded border border-neutral-300 bg-white p-4">
			<h2 class="text-sm font-semibold">Where you heard about us</h2>
			<p class="mt-0.5 text-xs text-neutral-500">
				{selected?.label} · {referralAnswered} of {selectedRows.length} applications answered
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
							{#each referralData as row (row.label)}
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
				<h2 class="text-sm font-semibold">Applications per season</h2>
				<p class="mt-0.5 text-xs text-neutral-500">All seasons, by the cohort applied for</p>
				<div class="mt-3 h-64">
					<BarChart
						data={perCohortData}
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
							{#each perCohortData as row (row.label)}
								<tr><td class="pr-6">{row.label}</td><td>{row.count}</td></tr>
							{/each}
						</tbody>
					</table>
				</details>
			</section>

			<section class="rounded border border-neutral-300 bg-white p-4">
				<h2 class="text-sm font-semibold">Application status</h2>
				<p class="mt-0.5 text-xs text-neutral-500">
					{selected?.label} · {selectedRows.length} applications
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
