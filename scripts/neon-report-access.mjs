import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const repo = process.env.GITHUB_REPOSITORY;
const run = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let secrets = [];
let variables = [];
let notes = [];
try {
    secrets = run(['secret', 'list']).split('\n').map(line => line.split(/\s+/)[0]).filter(name => name.startsWith('NEON_'));
} catch (error) { notes.push(`Secret-name check: ${error.message}`); }
try {
    const result = JSON.parse(run(['api', `repos/${repo}/actions/variables`]));
    variables = (result.variables || []).filter(item => item.name.startsWith('NEON_')).map(item => ({ name: item.name, value: item.value }));
} catch (error) { notes.push(`Variable check: ${error.message}`); }

const lines = [
    '### Neon credential access check',
    '',
    `Run: ${process.env.GITHUB_RUN_ID}`,
    `Secret names present: ${secrets.length ? secrets.join(', ') : 'none visible'}`,
    '',
    'Public project variables:',
    '```json',
    JSON.stringify(variables, null, 2),
    '```',
    ...notes
];
writeFileSync('/tmp/neon-access-report.md', lines.join('\n'));
run(['pr', 'comment', '11', '--body-file', '/tmp/neon-access-report.md']);
console.log('Published the non-secret Neon access report.');
