const { app } = require('bridge');

console.log('[小手机] 内置 Node.js 已启动');
console.log('[小手机] 数据目录:', app.datadir());

require('./server.cjs');
