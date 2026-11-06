<script lang="ts">
	// PRD 6.14.5 (CL-701): seasons table + create/edit dialog. No delete — seasons drive history
	// and are permanent by design (season transitions never reset or delete other data).
	//
	// CL-770 (Ron, 2026-11-05): seasons are planned in calendar DATES only. The backend
	// (seasons.adminSaveSeason) turns each date into its official moment: closing dates are 23:55
	// GMT that day, the season start is 00:00 GMT. Scoring opens the moment applications close, so
	// there is no "review open" input. People apply all year; a season's applications open when
	// the previous season's close.
	import { api } from '$convex/_generated/api';
	import { useConvexClient } from 'convex-svelte';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { Id } from '$convex/_generated/dataModel';

	type SeasonRow = {
		_id: Id<'seasons'>;
		name: string;
		applicationDeadline?: number;
		startDate: number;
		endDate: number;
		reviewWindowOpen: number;
		reviewWindowClose: number;
		feedbackDeadline: number;
	};

	const seasonsResponse = useStableQuery(api.seasons.adminListSeasons, () => ({}));
	let seasons = $derived((seasonsResponse.data ?? []) as SeasonRow[]);

	const convexClient = useConvexClient();

	// Stored moments are GMT-based, so their calendar date is read in UTC.
	const toDateInputValue = (ms: number | undefined) =>
		ms === undefined ? '' : new Date(ms).toISOString().slice(0, 10);
	const formatDate = (ms: number | undefined) =>
		ms === undefined
			? '—'
			: new Date(ms).toLocaleDateString('en-GB', {
					day: 'numeric',
					month: 'short',
					year: 'numeric',
					timeZone: 'UTC'
				});

	type FormState = {
		name: string;
		applicationDeadline: string;
		reviewWindowClose: string;
		startDate: string;
		endDate: string;
		feedbackDeadline: string;
	};

	const fields: Array<{ key: Exclude<keyof FormState, 'name'>; label: string; hint: string }> = [
		{
			key: 'applicationDeadline',
			label: 'Applications close',
			hint: 'Until 23:55 GMT. The next season’s applications open at that moment.'
		},
		{
			key: 'reviewWindowClose',
			label: 'Scoring deadline',
			hint: 'Guides score from when applications close until 23:55 GMT on this date.'
		},
		{
			key: 'startDate',
			label: 'Season starts',
			hint: 'The training weekend. Interviews have to be done before it.'
		},
		{ key: 'endDate', label: 'Season ends', hint: '' },
		{
			key: 'feedbackDeadline',
			label: 'Feedback deadline',
			hint: 'Guides’ end-of-season session feedback forms.'
		}
	];

	const emptyForm = (): FormState => ({
		name: '',
		applicationDeadline: '',
		reviewWindowClose: '',
		startDate: '',
		endDate: '',
		feedbackDeadline: ''
	});

	let dialogOpen = $state(false);
	let editSeasonId = $state<Id<'seasons'> | null>(null);
	let form = $state<FormState>(emptyForm());
	let formError = $state('');
	let pending = $state(false);

	// Mirrors seasons.adminSaveSeason. Dates are YYYY-MM-DD strings, which compare in date order.
	const validate = (value: FormState): string | null => {
		if (!value.name.trim()) return 'Name is required';
		if (fields.some((field) => !value[field.key])) return 'All five dates are required';
		if (value.reviewWindowClose <= value.applicationDeadline) {
			return 'The scoring deadline must be after applications close';
		}
		if (value.startDate <= value.reviewWindowClose) {
			return 'The season must start after the scoring deadline';
		}
		if (value.endDate <= value.startDate) return 'The season must end after it starts';
		if (value.feedbackDeadline <= value.endDate) {
			return 'The feedback deadline must be after the season ends';
		}
		return null;
	};

	const openCreateDialog = () => {
		editSeasonId = null;
		form = emptyForm();
		formError = '';
		dialogOpen = true;
	};

	const openEditDialog = (season: SeasonRow) => {
		editSeasonId = season._id;
		form = {
			name: season.name,
			applicationDeadline: toDateInputValue(season.applicationDeadline),
			reviewWindowClose: toDateInputValue(season.reviewWindowClose),
			startDate: toDateInputValue(season.startDate),
			endDate: toDateInputValue(season.endDate),
			feedbackDeadline: toDateInputValue(season.feedbackDeadline)
		};
		formError = '';
		dialogOpen = true;
	};

	const submit = async () => {
		const error = validate(form);
		if (error) {
			formError = error;
			return;
		}
		pending = true;
		formError = '';
		try {
			await convexClient.mutation(api.seasons.adminSaveSeason, {
				...(editSeasonId ? { seasonId: editSeasonId } : {}),
				name: form.name.trim(),
				applicationDeadline: form.applicationDeadline,
				reviewWindowClose: form.reviewWindowClose,
				startDate: form.startDate,
				endDate: form.endDate,
				feedbackDeadline: form.feedbackDeadline
			});
			dialogOpen = false;
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Failed to save season';
		} finally {
			pending = false;
		}
	};
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center justify-between">
		<p class="text-sm text-neutral-500">
			{seasons.length} season{seasons.length === 1 ? '' : 's'}. No delete — seasons are permanent
			history. Closing dates are 23:55 GMT.
		</p>
		<Button size="sm" onclick={openCreateDialog}>New season</Button>
	</div>

	{#if seasonsResponse.isLoading}
		<p class="text-sm text-neutral-500">Loading...</p>
	{:else if seasons.length === 0}
		<p
			class="rounded border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500"
		>
			No seasons yet.
		</p>
	{:else}
		<div class="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
			<table class="w-full text-left text-sm">
				<thead class="border-b border-neutral-200 text-neutral-500">
					<tr>
						<th class="px-3 py-2 font-medium">Name</th>
						<th class="px-3 py-2 font-medium">Applications close</th>
						<th class="px-3 py-2 font-medium">Scoring deadline</th>
						<th class="px-3 py-2 font-medium">Season starts</th>
						<th class="px-3 py-2 font-medium">Season ends</th>
						<th class="px-3 py-2 font-medium">Feedback deadline</th>
						<th class="px-3 py-2"></th>
					</tr>
				</thead>
				<tbody>
					{#each seasons as season (season._id)}
						<tr class="border-b border-neutral-100 last:border-0">
							<td class="px-3 py-2 font-medium">{season.name}</td>
							<td class="px-3 py-2 text-neutral-600">{formatDate(season.applicationDeadline)}</td>
							<td class="px-3 py-2 text-neutral-600">{formatDate(season.reviewWindowClose)}</td>
							<td class="px-3 py-2 text-neutral-600">{formatDate(season.startDate)}</td>
							<td class="px-3 py-2 text-neutral-600">{formatDate(season.endDate)}</td>
							<td class="px-3 py-2 text-neutral-600">{formatDate(season.feedbackDeadline)}</td>
							<td class="px-3 py-2 text-right">
								<Button size="sm" variant="outline" onclick={() => openEditDialog(season)}>
									Edit
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{editSeasonId ? 'Edit season' : 'New season'}</Dialog.Title>
			<Dialog.Description>
				Pick dates only. Closing dates mean 23:55 GMT that day; the season starts at 00:00 GMT.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-3">
			<label class="flex flex-col gap-1 text-sm">
				Name
				<Input bind:value={form.name} placeholder="Winter 2026" />
			</label>
			{#each fields as field (field.key)}
				<label class="flex flex-col gap-1 text-sm">
					{field.label}
					<Input type="date" bind:value={form[field.key]} />
					{#if field.hint}
						<span class="text-xs text-neutral-500">{field.hint}</span>
					{/if}
				</label>
			{/each}
			{#if formError}
				<p class="text-sm text-red-600">{formError}</p>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (dialogOpen = false)}>Cancel</Button>
			<Button disabled={pending} onclick={() => void submit()}>
				{editSeasonId ? 'Save' : 'Create'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
