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
		data.draftComments.some((dc) => dc.comment.targetType === 'inline' && dc.comment.status === 'draft')
	);
	// Feedback is required if: REQUEST_CHANGES, or no draft comments at all
	// (if there are draft comments, backend will handle generating body if needed)
	const isFeedbackRequired = $derived(reviewEvent === 'REQUEST_CHANGES' || !hasAnyDraftComments);

	async function submitReview() {
		const hasBody = reviewBody.trim().length > 0;

		// If REQUEST_CHANGES, body is always required
		if (reviewEvent === 'REQUEST_CHANGES' && !hasBody) {
			alert('Please provide feedback when requesting changes. GitHub requires a comment for this review type.');
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

<div class="max-w-4xl mx-auto p-6">
	<div class="flex items-center gap-4 mb-8">
		<a href="/app/sessions/{data.session.id}" class="text-blue-600 hover:underline">← Back to Plan</a>
		<h1 class="text-3xl font-bold">Review Wrap-up: {data.pr.title}</h1>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
		<section>
			<h2 class="text-xl font-semibold mb-4">Consolidated Notes</h2>
			{#if data.notes.length === 0}
				<p class="text-gray-500 italic">No notes added during this review.</p>
			{:else}
				<ul class="space-y-4">
					{#each data.notes as { note, step }}
						<li class="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
							<div class="flex justify-between items-start mb-2">
								<span class="text-xs font-bold uppercase text-gray-400">{step.title}</span>
								<span class="text-xs px-2 py-0.5 rounded bg-gray-100 font-medium">{note.severity}</span>
							</div>
							<p class="text-sm text-gray-700">{note.noteMarkdown}</p>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section>
			<h2 class="text-xl font-semibold mb-4">Pending Draft Comments</h2>
			{#if data.draftComments.filter(d => d.comment.status === 'draft').length === 0}
				<p class="text-gray-500 italic">No unpublished draft comments.</p>
			{:else}
				<ul class="space-y-4">
					{#each data.draftComments.filter(d => d.comment.status === 'draft') as { comment, step }}
						<li class="bg-amber-50 border border-amber-200 rounded-lg p-4">
							<div class="flex justify-between items-start mb-2">
								<span class="text-xs font-bold uppercase text-amber-600">{step.title}</span>
								<span class="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">{comment.targetType}</span>
							</div>
							<p class="text-sm text-amber-900 line-clamp-2">{comment.bodyMarkdown}</p>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<section class="bg-white border border-gray-200 rounded-xl p-8 shadow-md">
		<h2 class="text-2xl font-bold mb-6">Submit GitHub Review</h2>
		
		<div class="space-y-6">
			<div>
				<span class="block text-sm font-medium text-gray-700 mb-2">Review Status</span>
				<div class="flex gap-4">
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="radio" bind:group={reviewEvent} value="APPROVE" class="text-green-600 focus:ring-green-500" />
						<span class="font-medium text-green-700">Approve</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="radio" bind:group={reviewEvent} value="REQUEST_CHANGES" class="text-red-600 focus:ring-red-500" />
						<span class="font-medium text-red-700">Request Changes</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="radio" bind:group={reviewEvent} value="COMMENT" class="text-gray-600 focus:ring-gray-500" />
						<span class="font-medium text-gray-700">Comment only</span>
					</label>
				</div>
			</div>

			<div>
				<label for="review-body" class="block text-sm font-medium text-gray-700 mb-2">
					Overall Feedback {isFeedbackRequired ? '(required)' : '(optional)'}
				</label>
				<textarea
					id="review-body"
					bind:value={reviewBody}
					rows="4"
					class="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
					placeholder={isFeedbackRequired ? 'Please provide feedback...' : 'Add a top-level comment for this review...'}
					required={isFeedbackRequired}
				></textarea>
				{#if isFeedbackRequired}
					<p class="mt-1 text-xs text-gray-500">
						{#if reviewEvent === 'REQUEST_CHANGES'}
							GitHub requires a comment when requesting changes.
						{:else}
							Please provide feedback or add draft comments before submitting.
						{/if}
					</p>
				{:else if hasAnyDraftComments}
					<p class="mt-1 text-xs text-gray-500">
						You have draft comments that will be included in the review.
					</p>
				{/if}
			</div>

			<div class="pt-4 border-t border-gray-100 flex justify-end gap-4">
				<button class="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
					Export as Markdown
				</button>
				<button
					onclick={submitReview}
					class="px-8 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold"
				>
					Submit Review to GitHub
				</button>
			</div>
		</div>
	</section>
</div>

