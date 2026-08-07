<script lang="ts">
	import { page } from '$app/state';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { useConvexClient } from 'convex-svelte';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Dialog from '$lib/components/ui/dialog';
	import { routes } from '$lib/routes';

	// Staff application review (interim flow until peer review is staffed — see the main repo's
	// admin.ts section 5). Same data as the member app: the decision mutations mirror the reviewer
	// flow's side effects, and the chat below is the application's ordinary chat room — the
	// applicant reads and replies from the member app's chat page, staff from here.
	const convexClient = useConvexClient();

	let applicationId = $derived(page.params.applicationId as Id<'clubApplications'>);

	const detailResponse = useStableQuery(api.admin.adminGetApplication, () => ({ applicationId }));
	let detail = $derived(detailResponse.data ?? null);

	// Own profile id aligns own messages to the right, like any chat client.
	const meResponse = useStableQuery(api.profiles.getMe, {});
	let myProfileId = $derived(meResponse.data?._id ?? null);

	const messagesResponse = useStableQuery(api.chat.listMessages, () =>
		detail?.roomId ? { roomId: detail.roomId, limit: 200 } : 'skip'
	);
	let messages = $derived(
		detail?.roomId && messagesResponse.data?.roomId === detail.roomId
			? messagesResponse.data.messages
			: []
	);

	let messageListElement = $state<HTMLDivElement | null>(null);
	$effect(() => {
		// Track message count so new messages (sent or received) keep the list pinned to the bottom.
		void messages.length;
		if (messageListElement) {
			messageListElement.scrollTop = messageListElement.scrollHeight;
		}
	});

	let draft = $state('');
	let sendPending = $state(false);
	let chatError = $state('');

	const sendMessage = async () => {
		const content = draft.trim();
		if (!content || !detail?.roomId) return;
		chatError = '';
		sendPending = true;
		try {
			await convexClient.mutation(api.chat.sendMessage, { roomId: detail.roomId, content });
			draft = '';
		} catch (error) {
			chatError = error instanceof Error ? error.message : 'Failed to send the message';
		} finally {
			sendPending = false;
		}
	};

	let actionError = $state('');
	let actionPending = $state(false);

	let acceptDialogOpen = $state(false);
	let declineDialogOpen = $state(false);
	let declineNote = $state('');

	const moveToInterview = async () => {
		actionError = '';
		actionPending = true;
		try {
			await convexClient.mutation(api.admin.adminMoveToInterview, { applicationId });
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Failed to move to interview';
		} finally {
			actionPending = false;
		}
	};

	const decide = async (decision: 'accepted' | 'rejected') => {
		actionError = '';
		actionPending = true;
		try {
			await convexClient.mutation(api.admin.adminDecideApplication, {
				applicationId,
				decision,
				...(decision === 'rejected' && declineNote.trim()
					? { rejectionNote: declineNote.trim() }
					: {})
			});
			acceptDialogOpen = false;
			declineDialogOpen = false;
			declineNote = '';
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Failed to record the decision';
		} finally {
			actionPending = false;
		}
	};

	const statusLabel: Record<string, string> = {
		incomplete: 'Incomplete',
		pending: 'Pending',
		interview: 'Interview',
		accepted: 'Accepted',
		rejected: 'Rejected'
	};

	const statusVariant = (status: string) =>
		status === 'accepted'
			? ('secondary' as const)
			: status === 'rejected'
				? ('destructive' as const)
				: ('default' as const);

	const formatDate = (value: number) =>
		new Date(value).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});

	const formatTime = (value: number) =>
		new Date(value).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});

	let isDecidable = $derived(detail?.status === 'pending' || detail?.status === 'interview');
</script>

<div class="flex flex-col gap-4">
	<a
		class="text-sm text-neutral-500 underline-offset-2 hover:underline"
		href={routes.adminApplications}
	>
		← All applications
	</a>

	{#if detailResponse.isLoading}
		<p class="text-sm text-neutral-500">Loading…</p>
	{:else if !detail}
		<p class="rounded border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
			Application not found.
		</p>
	{:else}
		<div class="flex flex-wrap items-center gap-3">
			<h1 class="text-xl font-semibold">{detail.name}</h1>
			<Badge variant={statusVariant(detail.status)}>{statusLabel[detail.status]}</Badge>
		</div>
		<p class="-mt-2 text-sm text-neutral-500">
			Applied {formatDate(detail.createdAt)} by {detail.applicant?.name ?? 'Unknown applicant'}
			{#if detail.applicant?.username}(@{detail.applicant.username}){/if}
			{#if detail.decidedAt}
				· {statusLabel[detail.status]}
				{formatDate(detail.decidedAt)}{detail.decidedByName ? ` by ${detail.decidedByName}` : ''}
			{/if}
		</p>

		<div class="grid gap-4 lg:grid-cols-2">
			<div class="flex flex-col gap-4">
				<section class="rounded-lg border border-neutral-300 bg-white p-4">
					<h2 class="text-sm font-semibold text-neutral-600">Application</h2>
					<dl class="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
						<dt class="text-neutral-500">Applicant email</dt>
						<dd>
							{#if detail.applicant?.email}
								<a
									class="underline-offset-2 hover:underline"
									href={`mailto:${detail.applicant.email}`}
								>
									{detail.applicant.email}
								</a>
							{:else}
								—
							{/if}
						</dd>
						<dt class="text-neutral-500">Location</dt>
						<dd>{detail.location ?? '—'}</dd>
						<dt class="text-neutral-500">Applicant role</dt>
						<dd>{detail.applicantRole ?? '—'}</dd>
						<dt class="text-neutral-500">Referral</dt>
						<dd>
							{detail.referralSource ?? '—'}{detail.referralOther
								? ` (${detail.referralOther})`
								: ''}
						</dd>
						{#if detail.clubName}
							<dt class="text-neutral-500">Created club</dt>
							<dd>{detail.clubName}</dd>
						{/if}
						{#if detail.rejectionNote}
							<dt class="text-neutral-500">Rejection note</dt>
							<dd>{detail.rejectionNote}</dd>
						{/if}
					</dl>
					{#if detail.description}
						<p class="mt-3 border-t border-neutral-100 pt-3 text-sm text-neutral-700">
							{detail.description}
						</p>
					{/if}
				</section>

				<section class="rounded-lg border border-neutral-300 bg-white p-4">
					<h2 class="text-sm font-semibold text-neutral-600">Application video</h2>
					{#if detail.videoUrl}
						<!-- svelte-ignore a11y_media_has_caption -->
						<video class="mt-3 w-full rounded" controls preload="metadata" src={detail.videoUrl}
						></video>
					{:else}
						<p class="mt-3 text-sm text-neutral-500">No video submitted (or not ready yet).</p>
					{/if}
				</section>

				<section class="rounded-lg border border-neutral-300 bg-white p-4">
					<h2 class="text-sm font-semibold text-neutral-600">
						Peer reviews ({detail.reviews.length})
					</h2>
					{#if detail.reviews.length === 0}
						<p class="mt-3 text-sm text-neutral-500">No peer reviews yet.</p>
					{:else}
						<ul class="mt-3 flex flex-col gap-3">
							{#each detail.reviews as review (review.reviewId)}
								<li class="rounded border border-neutral-200 p-3 text-sm">
									<div class="flex flex-wrap items-center justify-between gap-2">
										<p class="font-medium">{review.reviewerName}</p>
										<p class="text-neutral-500">
											Score {review.score.toFixed(1)}
											{#if review.principlesScore !== null && review.safetyScore !== null}
												(principles {review.principlesScore} · safety {review.safetyScore})
											{/if}
										</p>
									</div>
									<p class="mt-1 text-neutral-700">{review.note}</p>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				{#if isDecidable}
					<section class="rounded-lg border border-neutral-300 bg-white p-4">
						<h2 class="text-sm font-semibold text-neutral-600">Decision</h2>
						<p class="mt-1 text-sm text-neutral-500">
							Accepting creates the club immediately and makes the applicant its Guide. Declining
							notifies the applicant; the chat stays open either way.
						</p>
						<div class="mt-3 flex flex-wrap gap-2">
							{#if detail.status === 'pending'}
								<Button
									variant="outline"
									disabled={actionPending}
									onclick={() => void moveToInterview()}
								>
									Move to interview
								</Button>
							{/if}
							<Button disabled={actionPending} onclick={() => (acceptDialogOpen = true)}>
								Accept
							</Button>
							<Button
								variant="destructive"
								disabled={actionPending}
								onclick={() => (declineDialogOpen = true)}
							>
								Decline
							</Button>
						</div>
						{#if actionError && !acceptDialogOpen && !declineDialogOpen}
							<p
								class="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
							>
								{actionError}
							</p>
						{/if}
					</section>
				{/if}
			</div>

			<section
				class="flex min-h-[28rem] flex-col rounded-lg border border-neutral-300 bg-white lg:max-h-[calc(100vh-14rem)]"
			>
				<div class="border-b border-neutral-200 px-4 py-3">
					<h2 class="text-sm font-semibold text-neutral-600">
						Chat with {detail.applicant?.name ?? 'the applicant'}
					</h2>
					<p class="text-xs text-neutral-400">
						The applicant sees this conversation in their app's chat.
					</p>
				</div>

				<div bind:this={messageListElement} class="flex-1 overflow-y-auto px-4 py-3">
					{#if !detail.roomId}
						<p class="py-8 text-center text-sm text-neutral-500">
							No chat yet — the room is created when the application is submitted.
						</p>
					{:else if messagesResponse.isLoading && messages.length === 0}
						<p class="py-8 text-center text-sm text-neutral-500">Loading messages…</p>
					{:else if messages.length === 0}
						<p class="py-8 text-center text-sm text-neutral-500">
							No messages yet. Say hi to the applicant!
						</p>
					{:else}
						<div class="flex flex-col gap-2">
							{#each messages as message (message._id)}
								{#if !message.profileId}
									<p class="py-1 text-center text-xs text-neutral-400 italic">{message.content}</p>
								{:else if message.profileId === myProfileId}
									<div class="flex justify-end">
										<div class="max-w-[80%] rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white">
											<p class="break-words whitespace-pre-wrap">{message.content}</p>
											<p class="mt-0.5 text-right text-[10px] text-neutral-400">
												{formatTime(message._creationTime)}
											</p>
										</div>
									</div>
								{:else}
									<div class="flex justify-start">
										<div class="max-w-[80%] rounded-lg bg-neutral-100 px-3 py-2 text-sm">
											<p class="text-xs font-medium text-neutral-500">
												{message.senderName ?? 'Unknown'}
											</p>
											<p class="break-words whitespace-pre-wrap text-neutral-900">
												{message.content}
											</p>
											<p class="mt-0.5 text-[10px] text-neutral-400">
												{formatTime(message._creationTime)}
											</p>
										</div>
									</div>
								{/if}
							{/each}
						</div>
					{/if}
				</div>

				<form
					class="flex items-end gap-2 border-t border-neutral-200 px-4 py-3"
					onsubmit={(event) => {
						event.preventDefault();
						void sendMessage();
					}}
				>
					<Textarea
						class="min-h-10 flex-1 resize-none"
						rows={1}
						placeholder={detail.roomId ? 'Message the applicant…' : 'Chat not available yet'}
						disabled={!detail.roomId || sendPending}
						bind:value={draft}
						onkeydown={(event: KeyboardEvent) => {
							if (event.key === 'Enter' && !event.shiftKey) {
								event.preventDefault();
								void sendMessage();
							}
						}}
					/>
					<Button type="submit" disabled={!detail.roomId || sendPending || !draft.trim()}>
						{sendPending ? 'Sending…' : 'Send'}
					</Button>
				</form>
				{#if chatError}
					<p class="px-4 pb-3 text-sm text-red-700">{chatError}</p>
				{/if}
			</section>
		</div>
	{/if}
</div>

<Dialog.Root bind:open={acceptDialogOpen}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Accept this application?</Dialog.Title>
			<Dialog.Description>
				This creates “{detail?.name}” immediately and makes {detail?.applicant?.name ??
					'the applicant'} its Guide. They get a notification and a message in the application chat.
			</Dialog.Description>
		</Dialog.Header>
		{#if actionError}
			<p class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
				{actionError}
			</p>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (acceptDialogOpen = false)} disabled={actionPending}>
				Cancel
			</Button>
			<Button onclick={() => void decide('accepted')} disabled={actionPending}>
				{actionPending ? 'Accepting…' : 'Accept application'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={declineDialogOpen}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Decline this application?</Dialog.Title>
			<Dialog.Description>
				{detail?.applicant?.name ?? 'The applicant'} is notified, and the optional note below is sent
				to them in the application chat.
			</Dialog.Description>
		</Dialog.Header>
		<Textarea
			placeholder="Optional note to the applicant (e.g. why, or what to improve)"
			rows={3}
			bind:value={declineNote}
		/>
		{#if actionError}
			<p class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
				{actionError}
			</p>
		{/if}
		<Dialog.Footer>
			<Button
				variant="outline"
				onclick={() => (declineDialogOpen = false)}
				disabled={actionPending}
			>
				Cancel
			</Button>
			<Button
				variant="destructive"
				onclick={() => void decide('rejected')}
				disabled={actionPending}
			>
				{actionPending ? 'Declining…' : 'Decline application'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
