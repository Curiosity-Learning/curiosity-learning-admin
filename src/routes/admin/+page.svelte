<script lang="ts">
	import { api } from '$convex/_generated/api';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { routes } from '$lib/routes';

	// CL-732 (PRD 6.14.1): the 6 Overview cards. Replaces the CL-693 stub
	// (clubCount/profileCount/openReportCount) with the real dashboard counts.
	const overviewResponse = useStableQuery(api.admin.getDashboardOverview, {});
	let overview = $derived(overviewResponse.data ?? null);

	const cards = $derived([
		{ label: 'Active clubs', value: overview?.activeClubCount, href: routes.adminClubs },
		{ label: 'Active Guides', value: overview?.activeGuideCount, href: null },
		{ label: 'Active Learners', value: overview?.activeLearnerCount, href: null },
		{
			label: 'Pending applications',
			value: overview?.pendingApplicationCount,
			href: routes.adminApplications
		},
		{
			label: 'Open safeguarding alerts',
			value: overview?.openSafeguardingAlertCount,
			href: routes.adminModeration
		},
		{
			label: 'Feedback completion',
			value:
				overview?.feedbackCompletionPercent === null ||
				overview?.feedbackCompletionPercent === undefined
					? undefined
					: `${overview.feedbackCompletionPercent}%`,
			href: null
		}
	]);
</script>

<h1 class="text-xl font-semibold">Overview</h1>

<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
	{#each cards as card (card.label)}
		{#if card.href}
			<a
				href={card.href}
				class="rounded border border-neutral-300 bg-white p-4 hover:bg-neutral-50"
			>
				<p class="text-2xl font-semibold">{card.value ?? '—'}</p>
				<p class="text-sm text-neutral-500">{card.label}</p>
			</a>
		{:else}
			<div class="rounded border border-neutral-300 bg-white p-4">
				<p class="text-2xl font-semibold">{card.value ?? '—'}</p>
				<p class="text-sm text-neutral-500">{card.label}</p>
			</div>
		{/if}
	{/each}
</div>
