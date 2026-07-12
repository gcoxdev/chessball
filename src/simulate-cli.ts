import { runCli } from './simulate';

try {
  setProcessExitCode(runCli(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  setProcessExitCode(1);
}

function setProcessExitCode(code: number): void {
  (process as typeof process & { exitCode?: number }).exitCode = code;
}
