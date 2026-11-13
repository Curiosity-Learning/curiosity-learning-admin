<script lang="ts">
	// CL-790: create a feedback form for a season, or edit one. Season and audience are fixed once
	// the form exists. A question somebody already answered keeps its type and can't be removed;
	// its text and "required" can still change. The backend (adminForms.ts) enforces the same.
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { untrack } from 'svelte';
	import { useConvexClient } from 'convex-svelte';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		audienceLabel,
		formatDate,
		kindOptions,
		type Audience,
		type FormDetail,
		type QuestionKind,
		type SeasonOption
	} from './feedback-forms';

	type Props = {
		formId: Id<'forms'> | null;
		// The saved form when editing; the draft starts from it and isn't overwritten by live updates.
		initial: FormDetail | null;
		existingForms: Array<{ seasonId: Id<'seasons'>; audience: Audience }>;
		onDone: () => void;
	};

	let { formId, initial, existingForms, onDone }: Props = $props();

	type DraftQuestion = {
		key: number;
		id?: string;
		label: string;
		kind: QuestionKind;
		required: boolean;
		answerCount: number;
	};

	const convexClient = useConvexClient();
	const seasonsResponse = useStableQuery(api.seasons.adminListSeasons, () => ({}));
	const formResponse = useStableQuery(api.adminForms.adminGetForm, () =>
		formId ? { formId } : 'skip'
	);

	const now = Date.now();
	let nextKey = 0;
	const blankQuestion = (kind: QuestionKind = 'scale_1_10'): DraftQuestion => ({
		key: nextKey++,
		label: '',
		kind,
		required: true,
		answerCount: 0
	});

	const start = untrack(() => initial);
	let title = $state(start?.title ?? '');
	let seasonId = $state<Id<'seasons'> | ''>(start?.seasonId ?? '');
	let audience = $state<Audience>(start?.audience ?? 'guide');
	let questions = $state<DraftQuestion[]>(
		start ? start.questions.map((question) => ({ ...question, key: nextKey++ })) : [blankQuestion()]
	);
	let error = $state('');
	let pending = $state(false);

	let seasons = $derived((seasonsResponse.data ?? []) as SeasonOption[]);
	// New forms only for seasons whose feedback deadline is still ahead.
	let openSeasons = $derived(seasons.filter((season) => season.feedbackDeadline > now));
	let selectedSeason = $derived(seasons.find((season) => season._id === seasonId) ?? null);
	const audienceTaken = (value: Audience) =>
		existingForms.some((form) => form.seasonId === seasonId && form.audience === value);

	// Live, so the warning appears if someone answers while the form is open here.
	let responseCount = $derived(
		(formResponse.data as FormDetail | undefined)?.responseCount ?? initial?.responseCount ?? 0
	);
	let isEdit = $derived(formId !== null);

	const move = (index: number, delta: number) => {
		const target = index + delta;
		if (target < 0 || target >= questions.length) return;
		const next = [...questions];
		[next[index], next[target]] = [next[target], next[index]];
		questions = next;
	};

	const remove = (index: number) => {
		questions = questions.filter((_, i) => i !== index);
	};

	const validate = () => {
		if (!isEdit && !seasonId) return 'Pick a season';
		if (!isEdit && audienceTaken(audience)) {
			return `This season already has a form for ${audienceLabel(audience)}`;
		}
		if (!title.trim()) return 'Give the form a title';
		if (questions.length === 0) return 'Add at least one question';
		const empty = questions.findIndex((question) => !question.label.trim());
		if (empty !== -1) return `Question ${empty + 1} needs a text`;
		return null;
	};

	const payload = () =>
		questions.map((question) => ({
			...(question.id ? { id: question.id } : {}),
			label: question.label.trim(),
			kind: question.kind,
			required: question.required
		}));

	const save = async () => {
		const problem = validate();
		if (problem) {
			error = problem;
			return;
		}
		pending = true;
		error = '';
		try {
			if (formId) {
				await convexClient.mutation(api.adminForms.adminUpdateForm, {
					formId,
					title: title.trim(),
					questions: payload()
				});
			} else if (seasonId) {
				await convexClient.mutation(api.adminForms.adminCreateForm, {
					seasonId,
					audience,
					title: title.trim(),
					questions: payload()
				});
			}
			onDone();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not save the form';
		} finally {
			pending = false;
		}
	};

	const deleteForm = async () => {
		if (!formId) return;
		if (!confirm('Delete this form? Nobody has answered it yet.')) return;
		pending = true;
		error = '';
		try {
			await convexClient.mutation(api.adminForms.adminDeleteForm, { formId });
			onDone();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not delete the form';
		} finally {
			pending = false;
		}
	};

	const selectClass = 'rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm';
</script>

<div class="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-lg font-semibold">{isEdit ? 'Edit feedback form' : 'New feedback form'}</h2>
		<Button size="sm" variant="ghost" onclick={onDone}>Back to list</Button>
	</div>

	{#if isEdit}
		<p class="text-sm text-neutral-600">
			{initial?.seasonName} · for {audienceLabel(audience)} ·
			{responseCount} answer{responseCount === 1 ? '' : 's'} so far
		</p>
		{#if responseCount > 0}
			<p class="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
				People have answered this form. You can reword questions, change "required" and add new
				questions. Answered questions can't be removed or change type.
			</p>
		{/if}
	{:else}
		<div class="flex flex-col gap-3 sm:flex-row">
			<label class="flex flex-1 flex-col gap-1 text-sm">
				Season
				<select bind:value={seasonId} class={selectClass}>
					<option value="">Pick a season</option>
					{#each openSeasons as season (season._id)}
						<option value={season._id}>{season.name}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-1 flex-col gap-1 text-sm">
				For
				<select bind:value={audience} class={selectClass}>
					<option value="guide" disabled={audienceTaken('guide')}>
						Guides{audienceTaken('guide') ? ' (has a form)' : ''}
					</option>
					<option value="learner" disabled={audienceTaken('learner')}>
						Learners{audienceTaken('learner') ? ' (has a form)' : ''}
					</option>
				</select>
			</label>
		</div>
		{#if selectedSeason}
			<p class="text-sm text-neutral-600">
				Shows up when the season ends ({formatDate(selectedSeason.endDate)}), due
				{formatDate(selectedSeason.feedbackDeadline)}.
			</p>
			{#if selectedSeason.endDate <= now}
				<p class="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
					This season has already ended, so the form is due for everyone as soon as you create it.
				</p>
			{/if}
		{:else if openSeasons.length === 0 && !seasonsResponse.isLoading}
			<p class="text-sm text-neutral-500">
				No season has a feedback deadline ahead. Add one in Seasons & Booklet first.
			</p>
		{/if}
	{/if}

	<label class="flex flex-col gap-1 text-sm">
		Title
		<Input bind:value={title} placeholder="Guide feedback, Winter 2026" maxlength={200} />
	</label>

	<div class="flex flex-col gap-3">
		<div class="flex flex-col gap-1">
			<h3 class="text-sm font-semibold">Questions</h3>
			<p class="text-xs text-neutral-500">
				Score answers (1–10) count towards the club's quality score: an average below 7 flags the
				club to its Club of Clubs group.
			</p>
		</div>
		{#each questions as question, index (question.key)}
			<div class="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
				<div class="flex items-center justify-between gap-2">
					<span class="text-xs font-medium text-neutral-500">
						Question {index + 1}
						{#if question.answerCount > 0}
							· {question.answerCount} answer{question.answerCount === 1 ? '' : 's'}
						{/if}
					</span>
					<div class="flex gap-1">
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Move up"
							disabled={index === 0}
							onclick={() => move(index, -1)}>↑</Button
						>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Move down"
							disabled={index === questions.length - 1}
							onclick={() => move(index, 1)}>↓</Button
						>
						<Button
							size="sm"
							variant="ghost"
							disabled={question.answerCount > 0}
							title={question.answerCount > 0 ? 'Answered questions cannot be removed' : ''}
							onclick={() => remove(index)}>Remove</Button
						>
					</div>
				</div>
				<Textarea
					bind:value={question.label}
					aria-label={`Question ${index + 1} text`}
					placeholder="How did this season go for your club?"
					maxlength={500}
					rows={2}
				/>
				<div class="flex flex-wrap items-center gap-4">
					<label class="flex items-center gap-2 text-sm">
						Type
						<select
							bind:value={question.kind}
							class={selectClass}
							disabled={question.answerCount > 0}
						>
							{#each kindOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>
					<label class="flex items-center gap-2 text-sm">
						<input type="checkbox" bind:checked={question.required} />
						Required
					</label>
				</div>
			</div>
		{/each}
		<div>
			<Button
				size="sm"
				variant="outline"
				onclick={() => (questions = [...questions, blankQuestion()])}
			>
				Add question
			</Button>
		</div>
	</div>

	{#if error}
		<p class="text-sm text-red-600">{error}</p>
	{/if}

	<div class="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-4">
		<div>
			{#if isEdit && responseCount === 0}
				<Button
					size="sm"
					variant="destructive"
					disabled={pending}
					onclick={() => void deleteForm()}
				>
					Delete form
				</Button>
			{/if}
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={onDone}>Cancel</Button>
			<Button disabled={pending} onclick={() => void save()}>
				{isEdit ? 'Save' : 'Create form'}
			</Button>
		</div>
	</div>
</div>
