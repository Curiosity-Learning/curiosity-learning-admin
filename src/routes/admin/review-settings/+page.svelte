<script lang="ts">
	// CL-795: the review-assignment settings (main repo reviewAssignmentModel.ts), editable here.
	// The assignment job gives each application `reviewersPerApplication` Guides and never more
	// than `maxReviewsPerGuidePerSeason` applications to one Guide in a season. A change only
	// affects applications that get their first reviewers after it: applications already being
	// reviewed keep the number they started with (the backend records it on each assignment).
	import { api } from '$convex/_generated/api';
	import { useConvexClient } from 'convex-svelte';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	const settingsResponse = useStableQuery(api.reviewAssignmentModel.adminGetReviewSettings, {});
	let settings = $derived(settingsResponse.data ?? null);

	const convexClient = useConvexClient();

	// The form values follow the saved settings (first load, after a save) and are overridden
	// while the admin types. Number inputs bind to a number, or null when empty.
	let reviewersPerApplication = $derived<number | null>(settings?.reviewersPerApplication ?? null);
	let maxReviewsPerGuidePerSeason = $derived<number | null>(
		settings?.maxReviewsPerGuidePerSeason ?? null
	);
	let formError = $state('');
	let savedMessage = $state('');
	let pending = $state(false);

	let dirty = $derived(
		settings !== null &&
			(reviewersPerApplication !== settings.reviewersPerApplication ||
				maxReviewsPerGuidePerSeason !== settings.maxReviewsPerGuidePerSeason)
	);

	// Mirrors adminUpdateReviewSettings.
	const checkValue = (
		value: number | null,
		label: string,
		limit: { min: number; max: number }
	): string | null => {
		if (value === null || !Number.isInteger(value) || value < limit.min || value > limit.max) {
			return `${label} must be a whole number from ${limit.min} to ${limit.max}.`;
		}
		return null;
	};

	let reviewersError = $derived(
		settings
			? checkValue(
					reviewersPerApplication,
					'Reviewers per application',
					settings.limits.reviewersPerApplication
				)
			: null
	);
	let maxReviewsError = $derived(
		settings
			? checkValue(
					maxReviewsPerGuidePerSeason,
					'Reviews per Guide per season',
					settings.limits.maxReviewsPerGuidePerSeason
				)
			: null
	);

	// How many applications a season can absorb with these numbers and today's Guides.
	let capacity = $derived.by(() => {
		if (!settings || reviewersError || maxReviewsError) return null;
		const reviewers = reviewersPerApplication ?? 1;
		const perGuide = maxReviewsPerGuidePerSeason ?? 0;
		return Math.floor((settings.eligibleGuideCount * perGuide) / reviewers);
	});

	const formatDateTime = (ms: number) =>
		new Date(ms).toLocaleString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});

	const save = async () => {
		savedMessage = '';
		formError = '';
		// The field errors are already shown next to the inputs.
		if (
			reviewersError ||
			maxReviewsError ||
			reviewersPerApplication === null ||
			maxReviewsPerGuidePerSeason === null
		) {
			return;
		}
		pending = true;
		try {
			await convexClient.mutation(api.reviewAssignmentModel.adminUpdateReviewSettings, {
				reviewersPerApplication,
				maxReviewsPerGuidePerSeason
			});
			savedMessage = 'Saved.';
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Failed to save the review settings';
		} finally {
			pending = false;
		}
	};

	const reset = () => {
		if (!settings) return;
		reviewersPerApplication = settings.reviewersPerApplication;
		maxReviewsPerGuidePerSeason = settings.maxReviewsPerGuidePerSeason;
		formError = '';
		savedMessage = '';
	};
</script>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-xl font-semibold">Review settings</h1>
		<p class="text-sm text-neutral-500">
			How applications are shared out to Guides for scoring. Assignment runs while a season's
			scoring window is open (Seasons & Booklet).
		</p>
	</div>

	{#if settingsResponse.isLoading || !settings}
		<p class="text-sm text-neutral-500">Loading...</p>
	{:else}
		<form
			class="flex max-w-xl flex-col gap-5 rounded-lg border border-neutral-200 bg-white p-4"
			onsubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			<label class="flex flex-col gap-1 text-sm">
				<span class="font-medium">Reviewers per application</span>
				<Input
					type="number"
					inputmode="numeric"
					min={settings.limits.reviewersPerApplication.min}
					max={settings.limits.reviewersPerApplication.max}
					step="1"
					bind:value={reviewersPerApplication}
					aria-invalid={Boolean(reviewersError)}
					class="w-32"
				/>
				<span class="text-xs text-neutral-500">
					How many Guides score each application. Default {settings.defaults
						.reviewersPerApplication}.
				</span>
				{#if reviewersError}
					<span class="text-xs text-red-600">{reviewersError}</span>
				{/if}
			</label>

			<label class="flex flex-col gap-1 text-sm">
				<span class="font-medium">Reviews per Guide per season</span>
				<Input
					type="number"
					inputmode="numeric"
					min={settings.limits.maxReviewsPerGuidePerSeason.min}
					max={settings.limits.maxReviewsPerGuidePerSeason.max}
					step="1"
					bind:value={maxReviewsPerGuidePerSeason}
					aria-invalid={Boolean(maxReviewsError)}
					class="w-32"
				/>
				<span class="text-xs text-neutral-500">
					The most applications one Guide is given in a season. Default {settings.defaults
						.maxReviewsPerGuidePerSeason}.
				</span>
				{#if maxReviewsError}
					<span class="text-xs text-red-600">{maxReviewsError}</span>
				{/if}
			</label>

			<div class="flex flex-col gap-1 rounded bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
				<p>
					{settings.eligibleGuideCount} Guide{settings.eligibleGuideCount === 1 ? '' : 's'} can review
					right now.
					{#if capacity !== null}
						With these numbers a season can take up to {capacity} application{capacity === 1
							? ''
							: 's'}.
					{/if}
				</p>
				{#if !reviewersError && reviewersPerApplication !== null && reviewersPerApplication > settings.eligibleGuideCount}
					<p class="text-amber-700">
						There are fewer Guides than reviewers per application, so applications will get fewer
						reviewers than this.
					</p>
				{/if}
				<p>
					A change applies to applications that get their first reviewers after you save.
					Applications already being reviewed keep the number they started with.
				</p>
			</div>

			{#if formError}
				<p class="text-sm text-red-600">{formError}</p>
			{/if}

			<div class="flex flex-wrap items-center gap-3">
				<Button type="submit" disabled={pending || !dirty}>Save</Button>
				<Button type="button" variant="outline" disabled={pending || !dirty} onclick={reset}>
					Cancel
				</Button>
				{#if savedMessage && !dirty}
					<span class="text-sm text-green-700">{savedMessage}</span>
				{/if}
				<span class="text-xs text-neutral-500">
					{settings.updatedAt === null
						? 'Using the defaults (never changed).'
						: `Last saved ${formatDateTime(settings.updatedAt)}.`}
				</span>
			</div>
		</form>
	{/if}
</div>
