const fs = require('fs');

let content = fs.readFileSync('src/components/LoginScreen.tsx', 'utf8');

// replace imports
content = content.replace("import { supabaseClient } from '../main';", "import { supabaseClient } from '../lib/supabase';");
content = content.replace("import { generateRSAKeyPair, exportPublicKey } from '../lib/crypto';\n", "");

// replace key generation
content = content.replace(
  "const keyPair = await generateRSAKeyPair();",
  "const keyPair = await window.crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']) as CryptoKeyPair;"
);

content = content.replace(
  "const pubKeyPem = await exportPublicKey(keyPair.publicKey);",
  "const exported = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);\n      const exportedAsString = String.fromCharCode(...new Uint8Array(exported));\n      const exportedAsBase64 = btoa(exportedAsString);\n      const pubKeyPem = `-----BEGIN PUBLIC KEY-----\\n${exportedAsBase64.match(/.{1,64}/g)?.join('\\n')}\\n-----END PUBLIC KEY-----`;"
);

fs.writeFileSync('src/components/LoginScreen.tsx', content);
console.log('Fixed LoginScreen');
