<script lang="ts">
	// PRD 6.14.5 (CL-701): seasons table + create/edit dialogs. No delete — seasons drive history
	// and are permanent by design (season transitions never reset or delete other data).
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
		startDate: number;
		endDate: number;
		reviewWindowOpen: number;
		reviewWindowClose: number;
		feedbackDeadline: number;
	};

	const seasonsResponse = useStableQuery(api.seasons.adminListSeasons, () => ({}));
	let seasons = $derived((seasonsResponse.data ?? []) as SeasonRow[]);

	const convexClient = useConvexClient();

	// datetime-local inputs work with "YYYY-MM-DDTHH:mm" local-time strings; seasons store
	// absolute ms timestamps, so we convert both ways at the edges only.
	const toLocalInputValue = (ms: number) => {
		const date = new Date(ms);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
	};
	const fromLocalInputValue = (value: string) => (value ? new Date(value).getTime() : NaN);

	type FormState = {
		name: string;
		startDate: string;
		endDate: string;
		reviewWindowOpen: string;
		reviewWindowClose: string;
		feedbackDeadline: string;
	};

	const emptyForm = (): FormState => ({
		name: '',
		startDate: '',
		endDate: '',
		reviewWindowOpen: '',
		reviewWindowClose: '',
		feedbackDeadline: ''
	});

	let createDialogOpen = $state(false);
	let createForm = $state<FormState>(emptyForm());
	let createError = $state('');
	let createPending = $state(false);

	let editDialogOpen = $state(false);
	let editSeasonId = $state<Id<'seasons'> | null>(null);
	let editForm = $state<FormState>(emptyForm());
	let editError = $state('');
	let editPending = $state(false);

	// Mirrors the server-side rules in src/convex/seasons.ts (validateSeasonFields).
	const validate = (form: FormState): string | null => {
		const startDate = fromLocalInputValue(form.startDate);
		const endDate = fromLocalInputValue(form.endDate);
		const reviewWindowOpen = fromLocalInputValue(form.reviewWindowOpen);
		const reviewWindowClose = fromLocalInputValue(form.reviewWindowClose);
		const feedbackDeadline = fromLocalInputValue(form.feedbackDeadline);

		if (!form.name.trim()) return 'Name is required';
		if (
			[startDate, endDate, reviewWindowOpen, reviewWindowClose, feedbackDeadline].some((n) =>
				Number.isNaN(n)
			)
		) {
			return 'All five dates are required';
		}
		if (endDate <= startDate) return 'End date must be after start date';
		if (reviewWindowClose <= reviewWindowOpen) {
			return 'Review window close must be after review window open';
		}
		if (feedbackDeadline <= endDate) return 'Feedback deadline must be after end date';
		return null;
	};

	const openCreateDialog = () => {
		createForm = emptyForm();
		createError = '';
		createDialogOpen = true;
	};

	const submitCreate = async () => {
		const error = validate(createForm);
		if (error) {
			createError = error;
			return;
		}
		createPending = true;
		createError = '';
		try {
			await convexClient.mutation(api.seasons.adminCreateSeason, {
				name: createForm.name.trim(),
				startDate: fromLocalInputValue(createForm.startDate),
				endDate: fromLocalInputValue(createForm.endDate),
				reviewWindowOpen: fromLocalInputValue(createForm.reviewWindowOpen),
				reviewWindowClose: fromLocalInputValue(createForm.reviewWindowClose),
				feedbackDeadline: fromLocalInputValue(createForm.feedbackDeadline)
			});
			createDialogOpen = false;
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Failed to create season';
		} finally {
			createPending = false;
		}
	};

	const openEditDialog = (season: SeasonRow) => {
		editSeasonId = season._id;
		editForm = {
			name: season.name,
			startDate: toLocalInputValue(season.startDate),
			endDate: toLocalInputValue(season.endDate),
			reviewWindowOpen: toLocalInputValue(season.reviewWindowOpen),
			reviewWindowClose: toLocalInputValue(season.reviewWindowClose),
			feedbackDeadline: toLocalInputValue(season.feedbackDeadline)
		};
		editError = '';
		editDialogOpen = true;
	};

	const submitEdit = async () => {
		if (!editSeasonId) return;
		const error = validate(editForm);
		if (error) {
			editError = error;
			return;
		}
		editPending = true;
		editError = '';
		try {
			await convexClient.mutation(api.seasons.adminUpdateSeason, {
				seasonId: editSeasonId,
				name: editForm.name.trim(),
				startDate: fromLocalInputValue(editForm.startDate),
				endDate: fromLocalInputValue(editForm.endDate),
				reviewWindowOpen: fromLocalInputValue(editForm.reviewWindowOpen),
				reviewWindowClose: fromLocalInputValue(editForm.reviewWindowClose),
				feedbackDeadline: fromLocalInputValue(editForm.feedbackDeadline)
			});
			editDialogOpen = false;
		} catch (err) {
			editError = err instanceof Error ? err.message : 'Failed to update season';
		} finally {
			editPending = false;
		}
	};

	const formatDate = (ms: number) => new Date(ms).toLocaleString();
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center justify-between">
		<p class="text-sm text-neutral-500">
			{seasons.length} season{seasons.length === 1 ? '' : 's'}. No delete — seasons are permanent
			history.
		</p>
		<Button size="sm" onclick={openCreateDialog}>New season</Button>
	</div>

	{#if seasonsResponse.isLoading}
		<p class="text-sm text-neutral-500">Loading...</p>
	{:else if seasons.length === 0}
		<p class="rounded border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
			No seasons yet.
		</p>
	{:else}
		<div class="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
			<table class="w-full text-left text-sm">
				<thead class="border-b border-neutral-200 text-neutral-500">
					<tr>
						<th class="px-3 py-2 font-medium">Name</th>
						<th class="px-3 py-2 font-medium">Start</th>
						<th class="px-3 py-2 font-medium">End</th>
						<th class="px-3 py-2 font-medium">Review open</th>
						<th class="px-3 py-2 font-medium">Review close</th>
						<th class="px-3 py-2 font-medium">Feedback deadline</th>
						<th class="px-3 py-2"></th>
					</tr>
				</thead>
				<tbody>
					{#each seasons as season (season._id)}
						<tr class="border-b border-neutral-100 last:border-0">
							<td class="px-3 py-2 font-medium">{season.name}</td>
							<td class="px-3 py-2 text-neutral-600">{formatDate(season.startDate)}</td>
							<td class="px-3 py-2 text-neutral-600">{formatDate(season.endDate)}</td>
							<td class="px-3 py-2 text-neutral-600">{formatDate(season.reviewWindowOpen)}</td>
							<td class="px-3 py-2 text-neutral-600">{formatDate(season.reviewWindowClose)}</td>
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

<Dialog.Root bind:open={createDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>New season</Dialog.Title>
			<Dialog.Description>All five dates are required.</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-3">
			<label class="flex flex-col gap-1 text-sm">
				Name
				<Input bind:value={createForm.name} placeholder="Autumn 2026" />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Start date
				<Input type="datetime-local" bind:value={createForm.startDate} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				End date
				<Input type="datetime-local" bind:value={createForm.endDate} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Review window open
				<Input type="datetime-local" bind:value={createForm.reviewWindowOpen} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Review window close
				<Input type="datetime-local" bind:value={createForm.reviewWindowClose} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Feedback deadline
				<Input type="datetime-local" bind:value={createForm.feedbackDeadline} />
			</label>
			{#if createError}
				<p class="text-sm text-red-600">{createError}</p>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (createDialogOpen = false)}>Cancel</Button>
			<Button disabled={createPending} onclick={() => void submitCreate()}>Create</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Edit season</Dialog.Title>
			<Dialog.Description>All five dates are required.</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-3">
			<label class="flex flex-col gap-1 text-sm">
				Name
				<Input bind:value={editForm.name} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Start date
				<Input type="datetime-local" bind:value={editForm.startDate} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				End date
				<Input type="datetime-local" bind:value={editForm.endDate} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Review window open
				<Input type="datetime-local" bind:value={editForm.reviewWindowOpen} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Review window close
				<Input type="datetime-local" bind:value={editForm.reviewWindowClose} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Feedback deadline
				<Input type="datetime-local" bind:value={editForm.feedbackDeadline} />
			</label>
			{#if editError}
				<p class="text-sm text-red-600">{editError}</p>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (editDialogOpen = false)}>Cancel</Button>
			<Button disabled={editPending} onclick={() => void submitEdit()}>Save</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
