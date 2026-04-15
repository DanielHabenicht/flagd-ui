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

// Check if OpenFeatureManager.Api.json exists
const openapiPath = path.join(uiRoot, 'OpenFeatureManager.Api.json');
if (!fs.existsSync(openapiPath)) {
  console.warn(
    `⚠ Warning: OpenFeatureManager.Api.json not found. This is expected if the API project hasn't been built yet.`,
  );
  console.warn(
    `⚠ Run 'dotnet build' in the src directory to generate the OpenAPI spec, then run 'npm install' again in the ui directory.`,
  );
  process.exit(0);
}

// Get absolute path for Docker volume mount
const cwd = uiRoot;
console.log(`✓ Working directory: ${cwd}`);

// Run Docker command with absolute path
// Use --user to avoid file permission issues on Linux/macOS
const userFlag =
  process.platform === 'win32' ? '' : ` --user ${process.getuid()}:${process.getgid()}`;
const dockerCmd = `docker run --rm${userFlag} -v "${cwd}:/local" openapitools/openapi-generator-cli:v7.21.0 generate -i /local/openapi.json -g typescript-angular -o /local/src/app/api-client`;

const result = spawnSync(dockerCmd, {
  shell: true,
  stdio: 'inherit',
});

process.exit(result.status);
