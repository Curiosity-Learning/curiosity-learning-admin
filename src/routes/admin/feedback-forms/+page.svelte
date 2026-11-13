<script lang="ts">
	// CL-790: seasonal feedback forms (PRD 6.11). Guides (and Learners) see a season's form once
	// the season ends and must submit it by the season's feedback deadline; after that CL-733's
	// reminder banner, popup and finally the access block kick in. The rules for what may change
	// once people have answered live in the main repo's src/convex/adminForms.ts.
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { Button } from '$lib/components/ui/button';
	import FormEditor from './form-editor.svelte';
	import { audienceLabel, formatDate, type FormDetail, type FormSummary } from './feedback-forms';

	const formsResponse = useStableQuery(api.adminForms.adminListForms, () => ({}));
	let forms = $derived((formsResponse.data ?? []) as FormSummary[]);

	// null = list only; 'new' = creating; an id = editing that form.
	let editing = $state<'new' | Id<'forms'> | null>(null);
	const editingResponse = useStableQuery(api.adminForms.adminGetForm, () =>
		editing && editing !== 'new' ? { formId: editing } : 'skip'
	);
	let editingForm = $derived(
		editing && editing !== 'new' ? ((editingResponse.data as FormDetail | undefined) ?? null) : null
	);

	const now = Date.now();
	const status = (form: { seasonEndDate: number | null; feedbackDeadline: number | null }) => {
		if (form.seasonEndDate === null || form.feedbackDeadline === null) return 'Unknown season';
		if (now < form.seasonEndDate) return `Opens ${formatDate(form.seasonEndDate)}`;
		if (now <= form.feedbackDeadline) return `Open, due ${formatDate(form.feedbackDeadline)}`;
		return `Overdue since ${formatDate(form.feedbackDeadline)}`;
	};
</script>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-xl font-semibold">Feedback forms</h1>
		<p class="text-sm text-neutral-500">
			End-of-season feedback. A season's form shows up for its Guides or Learners when the season
			ends and is due on the season's feedback deadline (set in Seasons & Booklet). Overdue forms
			lead to a reminder banner, a popup from day 8, and from day 15 a block until it is filled in.
		</p>
	</div>

	{#if editing === 'new' || (editing !== null && editingForm?._id === editing)}
		{#key editing}
			<FormEditor
				formId={editing === 'new' ? null : editing}
				initial={editingForm}
				existingForms={forms}
				onDone={() => (editing = null)}
			/>
		{/key}
	{:else if editing !== null}
		{#if editingResponse.error}
			<p class="text-sm text-red-600">Could not load the form: {editingResponse.error.message}</p>
		{:else}
			<p class="text-sm text-neutral-500">Loading...</p>
		{/if}
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-2">
			<p class="text-sm text-neutral-500">
				{forms.length} form{forms.length === 1 ? '' : 's'}. One per season for Guides and one for
				Learners.
			</p>
			<Button size="sm" onclick={() => (editing = 'new')}>New form</Button>
		</div>

		{#if formsResponse.isLoading}
			<p class="text-sm text-neutral-500">Loading...</p>
		{:else if formsResponse.error}
			<p class="text-sm text-red-600">Could not load forms: {formsResponse.error.message}</p>
		{:else if forms.length === 0}
			<p
				class="rounded border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500"
			>
				No feedback forms yet.
			</p>
		{:else}
			<div class="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
				<table class="w-full text-left text-sm">
					<thead class="border-b border-neutral-200 text-neutral-500">
						<tr>
							<th class="px-3 py-2 font-medium">Season</th>
							<th class="px-3 py-2 font-medium">For</th>
							<th class="px-3 py-2 font-medium">Title</th>
							<th class="px-3 py-2 font-medium">Questions</th>
							<th class="px-3 py-2 font-medium">Answers</th>
							<th class="px-3 py-2 font-medium">Status</th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#each forms as form (form._id)}
							<tr class="border-b border-neutral-100 last:border-0">
								<td class="px-3 py-2 font-medium whitespace-nowrap">{form.seasonName}</td>
								<td class="px-3 py-2 text-neutral-600">{audienceLabel(form.audience)}</td>
								<td class="px-3 py-2">{form.title}</td>
								<td class="px-3 py-2 text-neutral-600">{form.questionCount}</td>
								<td class="px-3 py-2 text-neutral-600">{form.responseCount}</td>
								<td class="px-3 py-2 whitespace-nowrap text-neutral-600">{status(form)}</td>
								<td class="px-3 py-2 text-right">
									<Button size="sm" variant="outline" onclick={() => (editing = form._id)}>
										Edit
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</div>
