import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devtoolsJson()],
	server: {
		host: '0.0.0.0',
		port: 3000,
		strictPort: true,
		hmr: {
			clientPort: 3001
		},
		watch: {
			usePolling: true
		}
	}
});
