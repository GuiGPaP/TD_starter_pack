import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
		},
		environment: "node",
		exclude: [
			...configDefaults.exclude,
			"**/*.live.test.{js,mjs,cjs,ts,mts,cts}",
		],
		globals: true,
		include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}"],
	},
});
