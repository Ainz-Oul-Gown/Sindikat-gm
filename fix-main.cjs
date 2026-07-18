const fs = require('fs');

let content = fs.readFileSync('src/main.tsx', 'utf8');
content = content.replace(/if \('serviceWorker' in navigator\).*?}\n/s, '');
fs.writeFileSync('src/main.tsx', content);

console.log('Fixed main.tsx');
