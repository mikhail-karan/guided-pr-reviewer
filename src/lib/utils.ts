export function safeParse<T>(
	json: string | null | undefined,
	fallback: T,
	wrapperKey?: 'summary' | 'overview'
): T {
	if (!json) return fallback;
	try {
		return JSON.parse(json) as T;
	} catch (e) {
		// Attempt to extract JSON if it's wrapped in text
		const match = json.match(/\{[\s\S]*\}/);
		if (match) {
			try {
				return JSON.parse(match[0]) as T;
			} catch (e2) {
				// ignore e2
			}
		}

		// If we have a wrapperKey hint, use it
		if (wrapperKey && json.trim().length > 0) {
			if (wrapperKey === 'summary') {
				return {
					summary: json,
					risks: [],
					reviewQuestions: []
				} as unknown as T;
			}
			if (wrapperKey === 'overview') {
				return {
					overview: json,
					keyChanges: []
				} as unknown as T;
			}
		}

		// Backward compatibility: If it's clearly not JSON but has content, and we're looking for an object
		// with a 'summary' or 'overview' field, wrap the raw text.
		if (typeof fallback === 'object' && fallback !== null && json.trim().length > 0) {
			if ('summary' in (fallback as any)) {
				return {
					summary: json,
					risks: [],
					reviewQuestions: []
				} as unknown as T;
			}
			if ('overview' in (fallback as any)) {
				return {
					overview: json,
					keyChanges: []
				} as unknown as T;
			}
		}

		// Only log if we couldn't even fall back to wrapping
		console.error('Failed to parse JSON and no suitable fallback wrapper found:', e, 'Content:', json);
		return fallback;
	}
}

