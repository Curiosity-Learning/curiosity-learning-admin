<script lang="ts">
	import { api } from '$convex/_generated/api';
	import { useConvexClient } from 'convex-svelte';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { Id } from '$convex/_generated/dataModel';

	// CL-730 (PRD 6.14.4): moderation queue, ported verbatim from the main repo's
	// src/routes/admin/moderation/+page.svelte (i18n removed — English-only, see README).
	const queueResponse = useStableQuery(api.moderation.listQueue, () => ({}));
	const recentActionsResponse = useStableQuery(api.moderation.listRecentActions, () => ({
		limit: 20
	}));

	const convexClient = useConvexClient();

	let queue = $derived(queueResponse.data ?? []);
	let recentActions = $derived(recentActionsResponse.data ?? []);

	let pendingKey = $state<string | null>(null);
	let errorMessage = $state('');

	let takedownDialogOpen = $state(false);
	let takedownReason = $state('');
	let takedownTarget = $state<{
		reportId?: Id<'reports'>;
		targetType: string;
		targetId: string;
	} | null>(null);

	let escalateDialogOpen = $state(false);
	let escalateNote = $state('');
	let escalateReportId = $state<Id<'reports'> | null>(null);

	const itemKey = (item: (typeof queue)[number]) =>
		item.kind === 'report' ? `report:${item.reportId}` : `media:${item.mediaAssetId}`;

	// Signed preview URLs for flagged media (the media bucket is private — every URL must be
	// CloudFront-signed, via the shared backend's moderationNode action). Keyed by asset id;
	// 'loading' while the action is in flight, 'unavailable' when it returns null or throws.
	let mediaPreviews = $state<Record<string, { url: string } | 'loading' | 'unavailable'>>({});

	$effect(() => {
		for (const item of queue) {
			if (item.kind !== 'flagged_media' || mediaPreviews[item.mediaAssetId]) continue;
			mediaPreviews[item.mediaAssetId] = 'loading';
			convexClient
				.action(api.moderationNode.getFlaggedMediaSignedUrl, { mediaAssetId: item.mediaAssetId })
				.then((result) => {
					mediaPreviews[item.mediaAssetId] = result ? { url: result.url } : 'unavailable';
				})
				.catch(() => {
					mediaPreviews[item.mediaAssetId] = 'unavailable';
				});
		}
	});

	const formatBytes = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	const runAction = async (key: string, fn: () => Promise<unknown>) => {
		pendingKey = key;
		errorMessage = '';
		try {
			await fn();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Action failed';
		} finally {
			pendingKey = null;
		}
	};

	const dismissReport = (reportId: Id<'reports'>) =>
		runAction(`report:${reportId}`, () =>
			convexClient.mutation(api.moderation.dismissReport, { reportId })
		);

	const dismissMedia = (mediaAssetId: Id<'mediaAssets'>) =>
		runAction(`media:${mediaAssetId}`, () =>
			convexClient.mutation(api.moderation.dismissFlaggedMedia, { mediaAssetId })
		);

	const openEscalate = (reportId: Id<'reports'>) => {
		escalateReportId = reportId;
		escalateNote = '';
		escalateDialogOpen = true;
	};

	const confirmEscalate = async () => {
		if (!escalateReportId) return;
		await runAction(`report:${escalateReportId}`, () =>
			convexClient.mutation(api.moderation.escalateReport, {
				reportId: escalateReportId as Id<'reports'>,
				note: escalateNote.trim() || undefined
			})
		);
		escalateDialogOpen = false;
	};

	const openTakedown = (item: (typeof queue)[number] & { kind: 'report' }) => {
		takedownTarget = {
			reportId: item.reportId,
			targetType: item.targetType,
			targetId: item.targetId
		};
		takedownReason = '';
		takedownDialogOpen = true;
	};

	const confirmTakedown = async () => {
		if (!takedownTarget) return;
		const { targetType, targetId, reportId } = takedownTarget;
		const reason = takedownReason.trim() || undefined;
		const key = reportId ? `report:${reportId}` : `target:${targetId}`;

		await runAction(key, async () => {
			if (targetType === 'project_update') {
				await convexClient.mutation(api.moderation.takedownUpdate, {
					updateId: targetId as Id<'updates'>,
					reason
				});
			} else if (targetType === 'comment') {
				await convexClient.mutation(api.moderation.takedownComment, {
					commentId: targetId as Id<'updateComments'>,
					reason
				});
			} else if (targetType === 'chat_message') {
				await convexClient.mutation(api.moderation.takedownMessage, {
					messageId: targetId as Id<'messages'>,
					reason
				});
			}
			// The takedown* mutations above already mark their matching open report 'actioned'.
			// 'club'/'user' targets have no content-takedown path in v1, so just dismiss the report.
			if (reportId && (targetType === 'club' || targetType === 'user')) {
				await convexClient.mutation(api.moderation.dismissReport, { reportId, note: reason });
			}
		});

		takedownDialogOpen = false;
	};

	const targetLinkHref = (targetType: string, targetId: string) => {
		if (targetType === 'project_update' || targetType === 'comment') {
			return null; // updates/comments aren't independently addressable by URL in this app.
		}
		if (targetType === 'club') return `/club/${targetId}`;
		if (targetType === 'user') return `/profile/${targetId}`;
		return null;
	};

	const canTakeDown = (targetType: string) =>
		targetType === 'project_update' || targetType === 'comment' || targetType === 'chat_message';
</script>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-xl font-semibold">Moderation</h1>
		<p class="mt-1 text-sm text-neutral-500">
			{queue.length} open item{queue.length === 1 ? '' : 's'}
		</p>
	</div>

	{#if errorMessage}
		<p class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
			{errorMessage}
		</p>
	{/if}

	{#if queueResponse.isLoading}
		<p class="text-sm text-neutral-500">Loading...</p>
	{:else if queue.length === 0}
		<p
			class="rounded border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500"
		>
			The moderation queue is empty.
		</p>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each queue as item (itemKey(item))}
				<li class="rounded-lg border border-neutral-200 bg-white p-4">
					{#if item.kind === 'report'}
						<div class="flex items-start justify-between gap-3">
							<div class="flex flex-col gap-1">
								<div class="flex items-center gap-2">
									<Badge variant="outline">{item.category}</Badge>
									<Badge variant="secondary">{item.targetType}</Badge>
								</div>
								<p class="text-sm text-neutral-700">
									Reported by <span class="font-medium">{item.reporterName}</span>
								</p>
								{#if item.contextText}
									<p class="rounded bg-neutral-50 px-2 py-1 text-sm text-neutral-600">
										"{item.contextText}"
									</p>
								{/if}
								{#if targetLinkHref(item.targetType, item.targetId)}
									<a
										href={targetLinkHref(item.targetType, item.targetId) ?? '#'}
										class="text-xs text-blue-600 underline"
										target="_blank"
										rel="noopener noreferrer"
									>
										Open target
									</a>
								{/if}
								<p class="text-xs text-neutral-400">{new Date(item.createdAt).toLocaleString()}</p>
							</div>
							<div class="flex shrink-0 flex-col gap-2">
								<Button
									size="sm"
									variant="outline"
									disabled={pendingKey === `report:${item.reportId}`}
									onclick={() => dismissReport(item.reportId)}
								>
									Dismiss
								</Button>
								{#if canTakeDown(item.targetType)}
									<Button
										size="sm"
										variant="destructive"
										disabled={pendingKey === `report:${item.reportId}`}
										onclick={() => openTakedown(item)}
									>
										Take down
									</Button>
								{/if}
								<Button
									size="sm"
									variant="secondary"
									disabled={pendingKey === `report:${item.reportId}`}
									onclick={() => openEscalate(item.reportId)}
								>
									Escalate
								</Button>
							</div>
						</div>
					{:else}
						{@const preview = mediaPreviews[item.mediaAssetId]}
						<div class="flex items-start justify-between gap-3">
							<div class="flex items-start gap-4">
								<div
									class="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded border border-neutral-200 bg-neutral-50"
								>
									{#if preview === 'loading' || !preview}
										<span class="text-xs text-neutral-400">Loading…</span>
									{:else if preview === 'unavailable'}
										<span class="px-2 text-center text-xs text-neutral-400">
											Preview unavailable
										</span>
									{:else if item.mediaKind === 'video'}
										<!-- svelte-ignore a11y_media_has_caption -->
										<video src={preview.url} controls class="h-full w-full object-cover"></video>
									{:else}
										<a href={preview.url} target="_blank" rel="noopener noreferrer">
											<img
												src={preview.url}
												alt="Flagged media"
												class="h-32 w-32 object-cover"
											/>
										</a>
									{/if}
								</div>
								<div class="flex flex-col gap-1">
									<div class="flex flex-wrap items-center gap-2">
										<Badge variant="outline">flagged media</Badge>
										<Badge variant="secondary">{item.mediaKind ?? 'unknown'}</Badge>
										{#if item.status !== 'ready'}
											<Badge variant="secondary">{item.status}</Badge>
										{/if}
									</div>
									<p class="text-sm text-neutral-700">
										Owner: <span class="font-medium">{item.ownerName}</span>
										<span class="ml-1 font-mono text-xs text-neutral-400">{item.ownerUserId}</span>
									</p>
									{#if item.moderationLabels?.labels?.length}
										<div class="flex flex-wrap gap-1">
											{#each item.moderationLabels.labels as label (label.name)}
												<span
													class="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800"
													title={label.parentName ? `Category: ${label.parentName}` : undefined}
												>
													{label.name}
													{Math.round(label.confidence)}%
												</span>
											{/each}
										</div>
									{/if}
									<p class="text-xs text-neutral-500">
										{[
											item.originalFilename,
											item.contentType,
											item.sizeBytes != null ? formatBytes(item.sizeBytes) : null
										]
											.filter(Boolean)
											.join(' · ')}
									</p>
									<p class="text-xs text-neutral-400">
										Uploaded {new Date(item.createdAt).toLocaleString()}
									</p>
								</div>
							</div>
							<div class="flex shrink-0 flex-col gap-2">
								<Button
									size="sm"
									variant="outline"
									disabled={pendingKey === `media:${item.mediaAssetId}`}
									onclick={() => dismissMedia(item.mediaAssetId)}
								>
									Dismiss
								</Button>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if recentActions.length > 0}
		<div class="mt-4">
			<h2 class="text-sm font-semibold text-neutral-600">Recent actions</h2>
			<ul class="mt-2 flex flex-col gap-1 text-xs text-neutral-500">
				{#each recentActions as action (action._id)}
					<li>
						{new Date(action.createdAt).toLocaleString()} — {action.actorName}
						{action.action}
						({action.targetType}
						{action.targetId})
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<Dialog.Root bind:open={takedownDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Take down content</Dialog.Title>
			<Dialog.Description
				>This removes the content from member-facing views. It stays in the database.</Dialog.Description
			>
		</Dialog.Header>
		<Textarea bind:value={takedownReason} rows={3} placeholder="Reason (optional)" />
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (takedownDialogOpen = false)}>Cancel</Button>
			<Button variant="destructive" onclick={() => void confirmTakedown()}>Take down</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={escalateDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Escalate report</Dialog.Title>
			<Dialog.Description
				>Flags this report for follow-up outside the normal queue.</Dialog.Description
			>
		</Dialog.Header>
		<Textarea bind:value={escalateNote} rows={3} placeholder="Note (optional)" />
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (escalateDialogOpen = false)}>Cancel</Button>
			<Button onclick={() => void confirmEscalate()}>Escalate</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
