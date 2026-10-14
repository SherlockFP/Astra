import { defineConfig } from 'vite';

export default defineConfig({
  // agent worktrees (.claude/worktrees) and docs are not app sources: watching them pegs the dev server CPU/RAM
  server: { port: 5173, host: true, watch: { ignored: ['**/.claude/**', '**/docs/**', '**/dev/combat-sim/**'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
