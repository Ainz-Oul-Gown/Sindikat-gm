const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  /{ name: 'ECDSA', namedCurve: 'P-256' }/g,
  "{ name: 'ECDSA', namedCurve: masterKeysJson?.ecdsa?.crv || ecdsa?.crv || 'P-256' }"
);

fs.writeFileSync('src/App.tsx', content);
console.log('Fixed curve import');
