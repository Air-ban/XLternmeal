const fs = require('fs');
const path = require('path');

// Copy index.html
const htmlSrc = path.join(__dirname, '..', 'src', 'renderer', 'index.html');
const htmlDest = path.join(__dirname, '..', 'dist', 'renderer', 'index.html');
fs.copyFileSync(htmlSrc, htmlDest);

// Copy xterm CSS
const cssPaths = [
  path.join(__dirname, '..', 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css'),
  path.join(__dirname, '..', 'node_modules', 'xterm', 'css', 'xterm.css'),
];
const cssDest = path.join(__dirname, '..', 'dist', 'renderer', 'xterm.css');

let copied = false;
for (const cssSrc of cssPaths) {
  if (fs.existsSync(cssSrc)) {
    fs.copyFileSync(cssSrc, cssDest);
    console.log('xterm.css copied successfully.');
    copied = true;
    break;
  }
}

if (!copied) {
  console.warn('Warning: xterm.css not found in node_modules.');
}

console.log('Assets copied to dist/renderer/');
