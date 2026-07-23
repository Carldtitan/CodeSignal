import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { repositoryRoot } from '../server/catalog.mjs';

test('every rendered button is connected to an action', async () => {
  const files = [
    'src/App.jsx',
    'src/components/ProblemList.jsx',
    'src/components/TopNav.jsx',
    'src/components/Workspace.jsx',
    'src/components/AiChatDrawer.jsx',
  ];
  for (const file of files) {
    const source = await fs.readFile(path.join(repositoryRoot, file), 'utf8');
    const buttons = [...source.matchAll(/<button\b([^>]*)>/g)];
    assert.ok(buttons.length, `${file} should contain controls`);
    for (const button of buttons) {
      assert.match(button[1], /onClick=/, `${file} has a button without an onClick handler: ${button[0]}`);
    }
  }
});

test('removed placeholder navigation does not return', async () => {
  const navigation = await fs.readFile(path.join(repositoryRoot, 'src/components/TopNav.jsx'), 'utf8');
  for (const placeholder of ['Premium', 'Discuss', 'Interview', 'Bell']) {
    assert.equal(navigation.includes(placeholder), false, `${placeholder} should not be rendered without a feature`);
  }
});
