/**
 * MCP 功能测试脚本
 *
 * 运行: npx tsx scripts/test-mcp.ts
 */

import { listTemplates } from '../src/mcp/tools/templates/list.js';
import { searchTemplates } from '../src/mcp/tools/templates/search.js';
import { getTemplateInfo } from '../src/mcp/tools/templates/info.js';
import { getSpaceInfo } from '../src/mcp/tools/space/info.js';
import { listDocResources, readDocResource, SYSTEM_GUIDE_URI } from '../src/mcp/resources/index.js';
import { initDatabase } from '../src/db/index.js';

// 初始化数据库
initDatabase();

async function testTools() {
  console.log('=== Testing MCP Tools ===\n');

  // 1. getSpaceInfo
  console.log('1. getSpaceInfo()');
  const spaceResult = await getSpaceInfo();
  console.log(spaceResult.content[0].text.substring(0, 200) + '...\n');

  // 2. listTemplates
  console.log('2. listTemplates()');
  const listResult = await listTemplates({});
  console.log(listResult.content[0].text.substring(0, 200) + '...\n');

  // 3. searchTemplates
  console.log('3. searchTemplates({ query: "vue" })');
  const searchResult = await searchTemplates({ query: 'vue' });
  console.log(searchResult.content[0].text.substring(0, 200) + '...\n');

  // 4. getTemplateInfo (需要有模板才能测试)
  console.log('4. getTemplateInfo({ name: "test" })');
  const infoResult = await getTemplateInfo({ name: 'test' });
  console.log(infoResult.content[0].text.substring(0, 200) + '...\n');
}

async function testResources() {
  console.log('=== Testing MCP Resources ===\n');

  // 1. listDocResources
  console.log('1. listDocResources()');
  const resources = await listDocResources();
  console.log('Resources count:', resources.length);
  resources.forEach(r => console.log(`  - ${r.name}: ${r.uri}`));
  console.log();

  // 2. readDocResource - guide
  console.log('2. readDocResource(SYSTEM_GUIDE_URI)');
  const guide = await readDocResource(SYSTEM_GUIDE_URI);
  if (guide) {
    console.log('Guide content (first 200 chars):');
    console.log(guide.text.substring(0, 200) + '...\n');
  }
}

async function main() {
  try {
    await testTools();
    await testResources();
    console.log('=== All tests completed ===');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

main();
