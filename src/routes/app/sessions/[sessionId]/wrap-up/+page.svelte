<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let reviewEvent = $state('COMMENT');
	let reviewBody = $state('');

	// Check if there are any draft comments
	const hasAnyDraftComments = $derived(
		data.draftComments.some((dc) => dc.comment.status === 'draft')
	);
	const hasInlineComments = $derived(
		data.draftComments.some(
			(dc) => dc.comment.targetType === 'inline' && dc.comment.status === 'draft'
		)
	);
	// Feedback is required if: REQUEST_CHANGES, or no draft comments at all
	// (if there are draft comments, backend will handle generating body if needed)
	const isFeedbackRequired = $derived(reviewEvent === 'REQUEST_CHANGES' || !hasAnyDraftComments);

	async function submitReview() {
		const hasBody = reviewBody.trim().length > 0;

		// If REQUEST_CHANGES, body is always required
		if (reviewEvent === 'REQUEST_CHANGES' && !hasBody) {
			alert(
				'Please provide feedback when requesting changes. GitHub requires a comment for this review type.'
			);
			return;
		}

		// If no body and no draft comments, require feedback
		if (!hasBody && !hasAnyDraftComments) {
			alert(
				'A review must include either a body comment or at least one draft comment. Please add feedback or comments before submitting.'
			);
			return;
		}

		const response = await fetch(`/api/sessions/${data.session.id}/submit-review`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ event: reviewEvent, body: reviewBody })
		});

		if (response.ok) {
			window.location.href = `/app/repos/${data.repo.installationId}/${data.repo.name}/prs`;
		} else {
			const errorData = await response.json().catch(() => ({ message: 'Failed to submit review' }));
			alert(errorData.message || 'Failed to submit review');
		}
	}
</script>

<div class="mx-auto max-w-4xl p-6">
	<div class="mb-8 flex items-center gap-4">
		<a
			href="/app/sessions/{data.session.id}"
			class="text-blue-600 hover:underline dark:text-blue-400">← Back to Plan</a
		>
		<h1 class="text-3xl font-bold dark:text-gray-100">Review Wrap-up: {data.pr.title}</h1>
	</div>

	<div class="mb-12 grid grid-cols-1 gap-8 md:grid-cols-2">
		<section>
			<h2 class="mb-4 text-xl font-semibold dark:text-gray-100">Consolidated Notes</h2>
			{#if data.notes.length === 0}
				<p class="text-gray-500 italic dark:text-gray-400">No notes added during this review.</p>
			{:else}
				<ul class="space-y-4">
					{#each data.notes as { note, step }}
						<li
							class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
						>
							<div class="mb-2 flex items-start justify-between">
								<span class="text-xs font-bold text-gray-400 uppercase dark:text-gray-500"
									>{step.title}</span
								>
								<span
									class="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium dark:bg-gray-700 dark:text-gray-300"
									>{note.severity}</span
								>
							</div>
							<p class="text-sm text-gray-700 dark:text-gray-300">{note.noteMarkdown}</p>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section>
			<h2 class="mb-4 text-xl font-semibold dark:text-gray-100">Pending Draft Comments</h2>
			{#if data.draftComments.filter((d) => d.comment.status === 'draft').length === 0}
				<p class="text-gray-500 italic dark:text-gray-400">No unpublished draft comments.</p>
			{:else}
				<ul class="space-y-4">
					{#each data.draftComments.filter((d) => d.comment.status === 'draft') as { comment, step }}
						<li
							class="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/30 dark:bg-amber-900/20"
						>
							<div class="mb-2 flex items-start justify-between">
								<span class="text-xs font-bold text-amber-600 uppercase dark:text-amber-400"
									>{step.title}</span
								>
								<span
									class="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
									>{comment.targetType}</span
								>
							</div>
							<p class="line-clamp-2 text-sm text-amber-900 dark:text-amber-200">
								{comment.bodyMarkdown}
							</p>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<section
		class="rounded-xl border border-gray-200 bg-white p-8 shadow-md dark:border-gray-700 dark:bg-gray-800"
	>
		<h2 class="mb-6 text-2xl font-bold dark:text-gray-100">Submit GitHub Review</h2>

		<div class="space-y-6">
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
					>Review Status</span
				>
				<div class="flex gap-4">
					<label class="flex cursor-pointer items-center gap-2">
						<input
							type="radio"
							bind:group={reviewEvent}
							value="APPROVE"
							class="text-green-600 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700"
						/>
						<span class="font-medium text-green-700 dark:text-green-400">Approve</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2">
						<input
							type="radio"
							bind:group={reviewEvent}
							value="REQUEST_CHANGES"
							class="text-red-600 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700"
						/>
						<span class="font-medium text-red-700 dark:text-red-400">Request Changes</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2">
						<input
							type="radio"
							bind:group={reviewEvent}
							value="COMMENT"
							class="text-gray-600 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-700"
						/>
						<span class="font-medium text-gray-700 dark:text-gray-300">Comment only</span>
					</label>
				</div>
			</div>

			<div>
				<label
					for="review-body"
					class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Overall Feedback {isFeedbackRequired ? '(required)' : '(optional)'}
				</label>
				<textarea
					id="review-body"
					bind:value={reviewBody}
					rows="4"
					class="w-full rounded-lg border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
					placeholder={isFeedbackRequired
						? 'Please provide feedback...'
						: 'Add a top-level comment for this review...'}
					required={isFeedbackRequired}
				></textarea>
				{#if isFeedbackRequired}
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
						{#if reviewEvent === 'REQUEST_CHANGES'}
							GitHub requires a comment when requesting changes.
						{:else}
							Please provide feedback or add draft comments before submitting.
						{/if}
					</p>
				{:else if hasAnyDraftComments}
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
						You have draft comments that will be included in the review.
					</p>
				{/if}
			</div>

			<div class="flex justify-end gap-4 border-t border-gray-100 pt-4 dark:border-gray-700">
				<button
					class="rounded-lg border border-gray-300 px-6 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
				>
					Export as Markdown
				</button>
				<button
					onclick={submitReview}
					class="rounded-lg bg-blue-600 px-8 py-2 font-bold text-white transition hover:bg-blue-700"
				>
					Submit Review to GitHub
				</button>
			</div>
		</div>
	</section>
</div>
