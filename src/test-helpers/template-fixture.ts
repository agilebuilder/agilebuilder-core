import { writeFile } from 'node:fs/promises';
import { initGitRepo, type GitFixtureFile } from './git-fixture.js';

export interface TemplateFixtureOptions {
  /** YAML or JSON string for the AgileBuilder config file. */
  config?: string;
  /** Config file name; defaults to `.agilebuilder.config.yaml`. */
  configFileName?: string;
  /** Additional files to write into the repo root. */
  files?: GitFixtureFile[];
}

/**
 * Create a local git repository that acts as a template source.
 */
export async function createTemplateRepo(
  repoDir: string,
  options: TemplateFixtureOptions = {},
): Promise<void> {
  const configFileName = options.configFileName ?? '.agilebuilder.config.yaml';
  const files: GitFixtureFile[] = [];

  if (options.config !== undefined) {
    files.push({ path: configFileName, content: options.config });
  }

  if (options.files) {
    files.push(...options.files);
  }

  await initGitRepo(repoDir, files);
}

/** Minimal AgileBuilder YAML config with a single required `projectName` variable. */
export const minimalYamlConfig = [
  'version: "1.0"',
  'variables:',
  '  enabled: true',
  '  delimiter: "%"',
  '  filePatterns:',
  '    mode: include',
  '    patterns:',
  '      - "**/*.txt"',
  '  inquirerQuestions:',
  '    - name: projectName',
  '      type: input',
  '      message: Project name',
  '      required: true',
  '',
].join('\n');

export const minimalTemplateFiles: GitFixtureFile[] = [
  { path: '{{ projectName }}.txt', content: 'Hello <%= projectName %>\n' },
  { path: 'README.md', content: '# Read me\n' },
  { path: 'raw.bin', content: Buffer.from([0, 1, 2, 3]) },
];
