import { spawn } from 'node:child_process';

const commands = [
  ['npm', ['run', 'dev:server']],
  ['npm', ['run', 'dev:client']],
];

const children = commands.map(([command, args]) => {
  const child = spawn(command, args, {
    shell: true,
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    }

    for (const other of children) {
      if (other !== child && !other.killed) {
        other.kill();
      }
    }
  });

  return child;
});

process.on('SIGINT', () => {
  for (const child of children) {
    child.kill('SIGINT');
  }
});
