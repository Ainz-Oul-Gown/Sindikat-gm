const fs = require('fs');

let devContent = fs.readFileSync('src/components/DevicesScreen.tsx', 'utf8');
if (!devContent.includes('arrayBufferToBase64')) {
  devContent = devContent.replace("import { supabaseClient } from '../lib/supabase';", "import { supabaseClient } from '../lib/supabase';\nimport { arrayBufferToBase64 } from '../lib/crypto';");
}

const devTarget = `const payloadData = {
          encKey: btoa(String.fromCharCode(...new Uint8Array(encryptedAesKeyBuf))),
          iv: btoa(String.fromCharCode(...iv)),
          cipher: btoa(String.fromCharCode(...new Uint8Array(ciphertextBuf)))
        };`;
const devNew = `const payloadData = {
          encKey: arrayBufferToBase64(encryptedAesKeyBuf),
          iv: arrayBufferToBase64(iv),
          cipher: arrayBufferToBase64(ciphertextBuf)
        };`;
devContent = devContent.replace(devTarget, devNew);
fs.writeFileSync('src/components/DevicesScreen.tsx', devContent);


let logContent = fs.readFileSync('src/components/LoginScreen.tsx', 'utf8');
if (!logContent.includes('base64ToArrayBuffer')) {
  logContent = logContent.replace("import { supabaseClient } from '../lib/supabase';", "import { supabaseClient } from '../lib/supabase';\nimport { base64ToArrayBuffer } from '../lib/crypto';");
}

const logTarget = `const { encKey, iv, cipher } = payload.payload.data;
            const encKeyBuf = new Uint8Array(atob(encKey).split('').map(c => c.charCodeAt(0)));
            const ivBuf = new Uint8Array(atob(iv).split('').map(c => c.charCodeAt(0)));
            const cipherBuf = new Uint8Array(atob(cipher).split('').map(c => c.charCodeAt(0)));`;
const logNew = `const { encKey, iv, cipher } = payload.payload.data;
            const encKeyBuf = base64ToArrayBuffer(encKey);
            const ivBuf = base64ToArrayBuffer(iv);
            const cipherBuf = base64ToArrayBuffer(cipher);`;
logContent = logContent.replace(logTarget, logNew);

// Also need to fix LoginScreen QR Code scanning structure (the payload.payload.data issue might be nested differently, but let's assume it's right)
fs.writeFileSync('src/components/LoginScreen.tsx', logContent);

console.log('Patched base64 functions');
