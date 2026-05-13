const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'renderer', 'index.html');
const dest = path.join(__dirname, '..', 'dist', 'renderer', 'index.html');

fs.copyFileSync(src, dest);
console.log('HTML copied to dist/renderer/');
