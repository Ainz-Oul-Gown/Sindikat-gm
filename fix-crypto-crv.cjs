const fs = require('fs');

let content = fs.readFileSync('src/lib/crypto.ts', 'utf8');

content = content.replace(
  "{ name: 'ECDSA', namedCurve: 'P-256' },",
  "{ name: 'ECDSA', namedCurve: deviceKeys.ecdsa.crv || 'P-256' },"
);

fs.writeFileSync('src/lib/crypto.ts', content);
console.log('Fixed crypto curve import');
