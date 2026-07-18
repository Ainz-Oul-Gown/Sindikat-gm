const fs = require('fs');

let content = fs.readFileSync('index.html', 'utf8');
content = content.replace('<html lang="en">', '<html lang="ru">');
fs.writeFileSync('index.html', content);

console.log('Fixed lang');
