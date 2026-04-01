import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(
	baseConfig,
	defineConfig({
		test: {
			exclude: [],
			include: ["tests/integration/**/*.live.test.ts"],
		},
	}),
);
