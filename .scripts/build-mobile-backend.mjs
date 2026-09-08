import { build } from 'esbuild';
import {
  mkdir,
  rm,
  writeFile
} from 'node:fs/promises';

const outDir = 'dist/nodejs';

console.log('开始构建小手机内置后端...');

await rm(outDir, {
  recursive: true,
  force: true
});

await mkdir(outDir, {
  recursive: true
});

// 把现有 server.ts 和它需要的 npm 依赖打成一个文件。
// 不修改 API、Base URL、Key、反代或模型逻辑。
await build({
  entryPoints: ['server.ts'],
  outfile: `${outDir}/server.cjs`,

  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',

  sourcemap: false,
  minify: false,

  define: {
    'process.env.NODE_ENV': '"production"'
  }
});

// 真正给手机内置 Node.js 启动的入口。
// bridge 是插件运行时自带模块。
const bootstrap = `
const { app } = require('bridge');

console.log('[小手机] 内置 Node.js 已启动');
console.log('[小手机] 数据目录:', app.datadir());

require('./server.cjs');
`;

await writeFile(
  `${outDir}/index.cjs`,
  bootstrap.trimStart(),
  'utf8'
);

await writeFile(
  `${outDir}/package.json`,
  JSON.stringify(
    {
      name: 'xiaoshouji-backend',
      version: '1.0.0',
      private: true,
      main: 'index.cjs'
    },
    null,
    2
  ),
  'utf8'
);

console.log('内置后端构建完成：');
console.log('✓ dist/nodejs/package.json');
console.log('✓ dist/nodejs/index.cjs');
console.log('✓ dist/nodejs/server.cjs');
