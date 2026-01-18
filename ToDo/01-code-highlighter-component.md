# Plan: Code Highlighter Component

## Overview
Add a code highlighter component that can be used to highlight code in a given language throughout the application, replacing or enhancing the current diff2html rendering.

## Current State
- The diff view uses `diff2html` library for rendering diffs
- No dedicated syntax highlighting component exists
- Code snippets in AI explanations and context packs lack proper syntax highlighting

## Implementation Steps

### 1. Choose a Syntax Highlighting Library
**Options:**
- **Shiki** (recommended) - Uses VS Code's TextMate grammars, beautiful themes, works well with SvelteKit
- **Prism.js** - Lightweight, extensible, good community support
- **highlight.js** - Popular, many languages supported

**Recommendation:** Use Shiki for its accuracy and VS Code-quality highlighting.

### 2. Install Dependencies
```bash
pnpm add shiki
```

### 3. Create the Component
Create `src/lib/components/CodeHighlighter.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { codeToHtml } from 'shiki';

  export let code: string;
  export let language: string = 'typescript';
  export let theme: string = 'github-dark';
  export let showLineNumbers: boolean = false;

  let highlightedHtml = '';
  let isLoading = true;

  onMount(async () => {
    highlightedHtml = await codeToHtml(code, {
      lang: language,
      theme: theme
    });
    isLoading = false;
  });
</script>
```

### 4. Add Language Detection Utility
Create `src/lib/utils/language-detection.ts`:
- Map file extensions to language identifiers
- Handle common edge cases (`.tsx`, `.jsx`, `.mjs`, etc.)

### 5. Integration Points
1. **Context Pack display** (`steps/[stepId]/+page.svelte`):
   - Replace raw code snippets with highlighted versions
   - Detect language from file path

2. **AI Explanations**:
   - Parse code blocks in markdown and apply highlighting
   - Use marked.js extension or custom renderer

3. **Future: Enhanced Diff View**:
   - Consider replacing diff2html with custom diff component using Shiki
   - Would allow more control over styling and inline comments

### 6. Performance Considerations
- Use lazy loading for syntax highlighting
- Consider server-side highlighting for initial render
- Cache highlighted code in memory for repeated views

### 7. Theming
- Support light/dark mode themes
- Match VS Code theme aesthetics
- Ensure good contrast for accessibility

## Files to Create/Modify
- `src/lib/components/CodeHighlighter.svelte` (new)
- `src/lib/utils/language-detection.ts` (new)
- `src/routes/app/sessions/[sessionId]/steps/[stepId]/+page.svelte` (modify)
- `src/routes/layout.css` (add Shiki styles)

## Testing
- Test with various languages (TypeScript, Python, Go, Rust, etc.)
- Verify performance with large code blocks
- Check accessibility with screen readers
- Test in both light and dark modes (when dark mode is added)

## Dependencies
- Depends on: None
- Blocks: Dark mode implementation (should coordinate themes)
