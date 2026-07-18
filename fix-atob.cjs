const fs = require('fs');
let content = fs.readFileSync('src/lib/crypto.ts', 'utf8');

content = content.replace(
  "const binaryString = atob(base64);",
  "const binaryString = atob(base64.replace(/[^A-Za-z0-9+/=]/g, ''));"
);

fs.writeFileSync('src/lib/crypto.ts', content);
