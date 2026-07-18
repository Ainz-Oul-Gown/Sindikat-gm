const fs = require('fs');

let content = fs.readFileSync('index.html', 'utf8');
content = content.replace('<link rel="manifest" href="/manifest.json" />', '');
fs.writeFileSync('index.html', content);

console.log('Fixed index.html');
