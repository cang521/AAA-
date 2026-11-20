import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import path from 'path';
import { defineConfig } from 'vite';

function resolveGitCommitSha(): string {
  if (process.env.VITE_GIT_COMMIT_SHA) {
    return process.env.VITE_GIT_COMMIT_SHA;
  }
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'local-workspace';
  }
}

function resolveBuildTime(): string {
  return process.env.VITE_BUILD_TIME || new Date().toISOString();
}

export default defineConfig(() => {
  const gitCommitSha = resolveGitCommitSha();
  const buildTime = resolveBuildTime();

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_GIT_COMMIT_SHA': JSON.stringify(gitCommitSha),
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
