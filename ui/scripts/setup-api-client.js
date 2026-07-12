#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// When run via npm, the script runs from the ui directory
// But ensure we're working with correct relative paths from the ui root
const uiRoot = path.dirname(path.dirname(path.resolve(__filename)));

const targetDir = path.join(uiRoot, 'src', 'app', 'api-client');
const sourceFile = path.join(uiRoot, '.openapi-generator-ignore');
const targetFile = path.join(targetDir, '.openapi-generator-ignore');

// Create directory recursively
fs.mkdirSync(targetDir, { recursive: true });

// Copy the openapi-generator-ignore file if it exists
if (fs.existsSync(sourceFile)) {
  fs.copyFileSync(sourceFile, targetFile);
  console.log(`✓ Directory created: ${targetDir}`);
  console.log(`✓ File copied: ${path.basename(sourceFile)} → ${path.relative(uiRoot, targetFile)}`);
} else {
  console.warn(`⚠ Warning: ${sourceFile} not found.`);
}

// Generate the client from the OpenAPI spec if it is present. When it is not
// (e.g. the Docker build generates the client in a dedicated stage), generation
// is skipped and only the post-generation patches below are applied to the
// already-generated client.
const openapiFile = 'OpenFeatureManager.Api.json';
const openapiPath = path.join(uiRoot, openapiFile);
if (fs.existsSync(openapiPath)) {
  console.log(`✓ Working directory: ${uiRoot}`);

  // Run Docker command with absolute path
  // Use --user to avoid file permission issues on Linux/macOS
  const userFlag =
    process.platform === 'win32' ? '' : ` --user ${process.getuid()}:${process.getgid()}`;
  const dockerCmd = `docker run --rm${userFlag} -v "${uiRoot}/${openapiFile}:/local/openapi.json" -v "${uiRoot}/src/app/api-client:/local/src/app/api-client" openapitools/openapi-generator-cli:v7.21.0 generate -i /local/openapi.json -g typescript-angular -o /local/src/app/api-client`;

  const result = spawnSync(dockerCmd, {
    shell: true,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status);
  }
} else {
  console.warn(`⚠ ${openapiFile} not found; skipping client generation and only applying patches.`);
  console.warn(
    `⚠ To regenerate, run 'dotnet build' in the src directory, then re-run this script.`,
  );
}

// Post-generation patches for known openapi-generator bugs
const patches = [
  {
    file: path.join(targetDir, 'model', 'flagEntryDto.ts'),
    find: "import { Null } from './null';",
    replace: "import { PerEnvironmentDefinitionDto } from './perEnvironmentDefinitionDto';",
    description: 'Fix incorrect Null import for PerEnvironmentDefinitionDto',
  },
];

for (const patch of patches) {
  if (!fs.existsSync(patch.file)) continue;
  let content = fs.readFileSync(patch.file, 'utf8');
  if (content.includes(patch.find)) {
    content = content.replace(patch.find, patch.replace);
    fs.writeFileSync(patch.file, content, 'utf8');
    console.log(`✓ Patched ${path.relative(uiRoot, patch.file)}: ${patch.description}`);
  }
}

process.exit(0);
