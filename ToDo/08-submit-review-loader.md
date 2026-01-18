# Plan: Add Loader to Submit Review Button

## Overview
Add a loading indicator to the "Submit Review to GitHub" button on the wrap-up page to provide feedback while the review is being submitted.

## Current State
- The `submitReview` function in `wrap-up/+page.svelte` makes an async fetch call
- No loading state is shown during submission
- User can potentially click the button multiple times
- No visual feedback that the action is in progress

## Implementation Steps

### 1. Add Loading State
Update `wrap-up/+page.svelte`:

```svelte
<script lang="ts">
  // ... existing code ...
  
  let isSubmitting = $state(false);
  let submitError = $state<string | null>(null);

  async function submitReview() {
    // ... validation code ...
    
    isSubmitting = true;
    submitError = null;

    try {
      const response = await fetch(`/api/sessions/${data.session.id}/submit-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: reviewEvent, body: reviewBody })
      });

      if (response.ok) {
        window.location.href = `/app/repos/${data.repo.installationId}/${data.repo.name}/prs`;
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Failed to submit review' }));
        submitError = errorData.message || 'Failed to submit review';
      }
    } catch (err) {
      submitError = err instanceof Error ? err.message : 'An unexpected error occurred';
    } finally {
      isSubmitting = false;
    }
  }
</script>
```

### 2. Update Button Component

```svelte
<button
  onclick={submitReview}
  disabled={isSubmitting}
  class="px-8 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
>
  {#if isSubmitting}
    <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle 
        class="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        stroke-width="4"
      ></circle>
      <path 
        class="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
    <span>Submitting...</span>
  {:else}
    <span>Submit Review to GitHub</span>
  {/if}
</button>
```

### 3. Show Error State
Add error display below the button:

```svelte
{#if submitError}
  <div class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
    <div class="flex items-center gap-2 text-red-700">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <p class="text-sm font-medium">{submitError}</p>
    </div>
    <button 
      onclick={() => submitError = null}
      class="mt-2 text-xs text-red-600 hover:text-red-800 underline cursor-pointer"
    >
      Dismiss
    </button>
  </div>
{/if}
```

### 4. Add Success Transition (Optional Enhancement)
Show brief success message before redirect:

```svelte
let submitSuccess = $state(false);

async function submitReview() {
  // ... validation and submission ...
  
  if (response.ok) {
    submitSuccess = true;
    // Brief delay to show success message
    setTimeout(() => {
      window.location.href = `/app/repos/${data.repo.installationId}/${data.repo.name}/prs`;
    }, 1000);
  }
}
```

```svelte
{#if submitSuccess}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-xl p-8 text-center shadow-xl">
      <svg class="w-16 h-16 mx-auto text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>
      <h3 class="text-xl font-bold text-gray-900">Review Submitted!</h3>
      <p class="text-gray-500 mt-2">Redirecting to PR list...</p>
    </div>
  </div>
{/if}
```

### 5. Disable Form During Submission
Prevent edits while submitting:

```svelte
<fieldset disabled={isSubmitting}>
  <!-- Review Status radio buttons -->
  <div class="flex gap-4">
    <label class="flex items-center gap-2 cursor-pointer">
      <input type="radio" bind:group={reviewEvent} value="APPROVE" />
      <span>Approve</span>
    </label>
    <!-- ... other options ... -->
  </div>
  
  <!-- Feedback textarea -->
  <textarea
    bind:value={reviewBody}
    disabled={isSubmitting}
    class="..."
  ></textarea>
</fieldset>
```

### 6. Add Aria Live Region
For accessibility:

```svelte
<div role="status" aria-live="polite" class="sr-only">
  {#if isSubmitting}
    Submitting review to GitHub...
  {:else if submitSuccess}
    Review submitted successfully!
  {:else if submitError}
    Error: {submitError}
  {/if}
</div>
```

## Files to Modify
- `src/routes/app/sessions/[sessionId]/wrap-up/+page.svelte`

## Complete Updated Component

Here's the full updated button section:

```svelte
<div class="pt-4 border-t border-gray-100">
  {#if submitError}
    <div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start justify-between">
      <div class="flex items-center gap-2 text-red-700">
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="text-sm">{submitError}</p>
      </div>
      <button 
        onclick={() => submitError = null}
        class="text-red-500 hover:text-red-700 cursor-pointer"
        aria-label="Dismiss error"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  {/if}
  
  <div class="flex justify-end gap-4">
    <button 
      class="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium cursor-pointer disabled:opacity-50"
      disabled={isSubmitting}
    >
      Export as Markdown
    </button>
    <button
      onclick={submitReview}
      disabled={isSubmitting}
      class="px-8 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[200px] cursor-pointer"
    >
      {#if isSubmitting}
        <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Submitting...</span>
      {:else}
        <span>Submit Review to GitHub</span>
      {/if}
    </button>
  </div>
</div>
```

## Testing
- Click submit and verify spinner appears
- Verify button is disabled during submission
- Test error handling (disconnect network, mock API error)
- Verify success redirect works
- Test accessibility with screen reader

## Dependencies
- None - isolated UI change
