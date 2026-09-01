<script lang="ts">
	// PRD 6.14.6 (CL-701): activity booklet curation — list, create/edit (title, markdown content,
	// minutes, building-block multi-select), delete with confirm. Deleting only removes the shared
	// booklet source entry; any session that already added the activity keeps its own copy
	// (addToSession forks the fields, it doesn't reference this row — see booklet.ts).
	import { api } from '$convex/_generated/api';
	import { useConvexClient } from 'convex-svelte';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { Id } from '$convex/_generated/dataModel';

	type ActivityRow = {
		_id: Id<'bookletActivities'>;
		name: string;
		content: string | null;
		minutes: number | null;
		buildingBlockIds: Id<'buildingBlocks'>[];
		buildingBlockNames: string[];
	};

	type BuildingBlockRow = {
		_id: Id<'buildingBlocks'>;
		name: string;
	};

	const activitiesResponse = useStableQuery(api.booklet.adminListActivities, () => ({}));
	const blocksResponse = useStableQuery(api.booklet.adminListBuildingBlocks, () => ({}));

	let activities = $derived((activitiesResponse.data ?? []) as ActivityRow[]);
	let buildingBlocks = $derived((blocksResponse.data ?? []) as BuildingBlockRow[]);

	const convexClient = useConvexClient();

	type FormState = {
		name: string;
		content: string;
		// The Input component binds type="number" values as `number` (or '' when empty), not
		// always `string` — normalize with String(...) before calling string methods on it.
		minutes: string | number;
		buildingBlockIds: Id<'buildingBlocks'>[];
	};

	const emptyForm = (): FormState => ({ name: '', content: '', minutes: '', buildingBlockIds: [] });

	let createDialogOpen = $state(false);
	let createForm = $state<FormState>(emptyForm());
	let createError = $state('');
	let createPending = $state(false);

	let editDialogOpen = $state(false);
	let editActivityId = $state<Id<'bookletActivities'> | null>(null);
	let editForm = $state<FormState>(emptyForm());
	let editError = $state('');
	let editPending = $state(false);

	let deleteDialogOpen = $state(false);
	let deleteTarget = $state<ActivityRow | null>(null);
	let deletePending = $state(false);
	let deleteError = $state('');

	const toggleBlock = (form: FormState, blockId: Id<'buildingBlocks'>) => {
		if (form.buildingBlockIds.includes(blockId)) {
			form.buildingBlockIds = form.buildingBlockIds.filter((id) => id !== blockId);
		} else {
			form.buildingBlockIds = [...form.buildingBlockIds, blockId];
		}
	};

	const validate = (form: FormState): string | null => {
		if (!form.name.trim()) return 'Title is required';
		const minutes = String(form.minutes).trim();
		if (minutes && (Number.isNaN(Number(minutes)) || Number(minutes) < 0)) {
			return 'Minutes must be a non-negative number';
		}
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
			await convexClient.mutation(api.booklet.adminCreateActivity, {
				name: createForm.name.trim(),
				content: createForm.content.trim() || undefined,
				minutes: String(createForm.minutes).trim() ? Number(createForm.minutes) : undefined,
				buildingBlockIds: createForm.buildingBlockIds
			});
			createDialogOpen = false;
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Failed to create activity';
		} finally {
			createPending = false;
		}
	};

	const openEditDialog = (activity: ActivityRow) => {
		editActivityId = activity._id;
		editForm = {
			name: activity.name,
			content: activity.content ?? '',
			minutes: activity.minutes != null ? String(activity.minutes) : '',
			buildingBlockIds: [...activity.buildingBlockIds]
		};
		editError = '';
		editDialogOpen = true;
	};

	const submitEdit = async () => {
		if (!editActivityId) return;
		const error = validate(editForm);
		if (error) {
			editError = error;
			return;
		}
		editPending = true;
		editError = '';
		try {
			await convexClient.mutation(api.booklet.adminUpdateActivity, {
				activityId: editActivityId,
				name: editForm.name.trim(),
				content: editForm.content.trim() || undefined,
				minutes: String(editForm.minutes).trim() ? Number(editForm.minutes) : undefined,
				buildingBlockIds: editForm.buildingBlockIds
			});
			editDialogOpen = false;
		} catch (err) {
			editError = err instanceof Error ? err.message : 'Failed to update activity';
		} finally {
			editPending = false;
		}
	};

	const openDeleteDialog = (activity: ActivityRow) => {
		deleteTarget = activity;
		deleteError = '';
		deleteDialogOpen = true;
	};

	const confirmDelete = async () => {
		if (!deleteTarget) return;
		deletePending = true;
		deleteError = '';
		try {
			await convexClient.mutation(api.booklet.adminDeleteActivity, {
				activityId: deleteTarget._id
			});
			deleteDialogOpen = false;
		} catch (err) {
			deleteError = err instanceof Error ? err.message : 'Failed to delete activity';
		} finally {
			deletePending = false;
		}
	};
</script>

<div class="flex flex-col gap-4">
	<div class="flex items-center justify-between">
		<p class="text-sm text-neutral-500">
			{activities.length} activit{activities.length === 1 ? 'y' : 'ies'}
		</p>
		<Button size="sm" onclick={openCreateDialog}>New activity</Button>
	</div>

	{#if activitiesResponse.isLoading}
		<p class="text-sm text-neutral-500">Loading...</p>
	{:else if activities.length === 0}
		<p
			class="rounded border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500"
		>
			No booklet activities yet.
		</p>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each activities as activity (activity._id)}
				<li class="rounded-lg border border-neutral-200 bg-white p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="flex flex-col gap-1">
							<p class="font-medium">{activity.name}</p>
							<div class="flex flex-wrap items-center gap-1.5">
								{#if activity.minutes != null}
									<Badge variant="secondary">{activity.minutes} min</Badge>
								{/if}
								{#each activity.buildingBlockNames as blockName (blockName)}
									<Badge variant="outline">{blockName}</Badge>
								{/each}
							</div>
							{#if activity.content}
								<p class="mt-1 line-clamp-2 max-w-2xl text-sm whitespace-pre-wrap text-neutral-600">
									{activity.content}
								</p>
							{/if}
						</div>
						<div class="flex shrink-0 gap-2">
							<Button size="sm" variant="outline" onclick={() => openEditDialog(activity)}>
								Edit
							</Button>
							<Button size="sm" variant="destructive" onclick={() => openDeleteDialog(activity)}>
								Delete
							</Button>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<Dialog.Root bind:open={createDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>New activity</Dialog.Title>
			<Dialog.Description>Content supports markdown.</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-3">
			<label class="flex flex-col gap-1 text-sm">
				Title
				<Input bind:value={createForm.name} placeholder="Mini project kickoff" />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Content (markdown)
				<Textarea bind:value={createForm.content} rows={6} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Minutes
				<Input type="number" min="0" bind:value={createForm.minutes} placeholder="30" />
			</label>
			<fieldset class="flex flex-col gap-1 text-sm">
				<legend>Building blocks</legend>
				<div class="flex flex-wrap gap-2">
					{#each buildingBlocks as block (block._id)}
						<button
							type="button"
							class="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors {createForm.buildingBlockIds.includes(
								block._id
							)
								? 'border-orange-500 bg-orange-50 text-orange-600'
								: 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'}"
							onclick={() => toggleBlock(createForm, block._id)}
						>
							{block.name}
						</button>
					{/each}
				</div>
			</fieldset>
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
			<Dialog.Title>Edit activity</Dialog.Title>
			<Dialog.Description>Content supports markdown.</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-3">
			<label class="flex flex-col gap-1 text-sm">
				Title
				<Input bind:value={editForm.name} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Content (markdown)
				<Textarea bind:value={editForm.content} rows={6} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Minutes
				<Input type="number" min="0" bind:value={editForm.minutes} />
			</label>
			<fieldset class="flex flex-col gap-1 text-sm">
				<legend>Building blocks</legend>
				<div class="flex flex-wrap gap-2">
					{#each buildingBlocks as block (block._id)}
						<button
							type="button"
							class="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors {editForm.buildingBlockIds.includes(
								block._id
							)
								? 'border-orange-500 bg-orange-50 text-orange-600'
								: 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'}"
							onclick={() => toggleBlock(editForm, block._id)}
						>
							{block.name}
						</button>
					{/each}
				</div>
			</fieldset>
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

<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete activity</Dialog.Title>
			<Dialog.Description>
				This removes "{deleteTarget?.name}" from the booklet. Sessions that already added this
				activity keep their own copy — deleting here does not affect them.
			</Dialog.Description>
		</Dialog.Header>
		{#if deleteError}
			<p class="text-sm text-red-600">{deleteError}</p>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (deleteDialogOpen = false)}>Cancel</Button>
			<Button variant="destructive" disabled={deletePending} onclick={() => void confirmDelete()}>
				Delete
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
