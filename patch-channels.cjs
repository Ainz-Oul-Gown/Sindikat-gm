const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace("channel('kill-switch')", "channel(`kill-switch-${deviceId}`)");
content = content.replace("channel('admin-sync')", "channel(`admin-sync-${userId}`)");

content = content.replace("const impEcdsa = await window.crypto.subtle.importKey('jwk', ecdsa, { name: 'ECDSA', namedCurve: 'P-384' }, true, ['sign']);", "const impEcdsa = await window.crypto.subtle.importKey('jwk', ecdsa, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);");

fs.writeFileSync('src/App.tsx', content);
