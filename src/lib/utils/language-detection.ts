/**
 * Maps file extensions to Shiki language identifiers
 */
const extensionMap: Record<string, string> = {
	// TypeScript/JavaScript
	ts: 'typescript',
	tsx: 'tsx',
	js: 'javascript',
	jsx: 'jsx',
	mjs: 'javascript',
	cjs: 'javascript',
	
	// Web
	svelte: 'svelte',
	vue: 'vue',
	html: 'html',
	css: 'css',
	scss: 'scss',
	sass: 'sass',
	less: 'less',
	
	// Backend
	py: 'python',
	go: 'go',
	rs: 'rust',
	rb: 'ruby',
	php: 'php',
	java: 'java',
	kt: 'kotlin',
	scala: 'scala',
	clj: 'clojure',
	
	// Data/Config
	json: 'json',
	yaml: 'yaml',
	yml: 'yaml',
	toml: 'toml',
	xml: 'xml',
	
	// Database
	sql: 'sql',
	
	// Shell
	sh: 'bash',
	bash: 'bash',
	zsh: 'bash',
	fish: 'fish',
	powershell: 'powershell',
	ps1: 'powershell',
	
	// Documentation
	md: 'markdown',
	mdx: 'mdx',
	
	// Other
	dockerfile: 'dockerfile',
	env: 'properties',
	properties: 'properties',
	ini: 'ini',
	conf: 'ini',
	txt: 'text',
};

/**
 * Detects the language identifier for Shiki based on a file path
 * @param filePath - The file path (e.g., "src/utils.ts" or "package.json")
 * @returns Shiki language identifier, defaults to 'text' if unknown
 */
export function detectLanguage(filePath: string): string {
	if (!filePath) return 'text';
	
	// Extract extension (handle multiple dots and special cases)
	const parts = filePath.split('.');
	if (parts.length < 2) return 'text';
	
	const extension = parts[parts.length - 1].toLowerCase();
	
	// Handle special cases
	if (extension === 'dockerfile' || filePath.toLowerCase().includes('dockerfile')) {
		return 'dockerfile';
	}
	
	// Check extension map
	return extensionMap[extension] || 'text';
}
