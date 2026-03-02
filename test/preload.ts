/**
 * Test preload — Global test environment setup.
 *
 * Loaded before every test file via bunfig.toml [test].preload.
 *
 * Chalk disables colors in non-TTY environments (CI, test runners).
 * Force truecolor so ANSI-dependent tests produce consistent output.
 */

import chalk from "chalk";

chalk.level = 3; // truecolor (24-bit) — consistent across all environments
