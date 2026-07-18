const fs = require('fs');

let devContent = fs.readFileSync('src/components/DevicesScreen.tsx', 'utf8');

const devStartStr = "const payloadBytes = new TextEncoder().encode(payloadStr);";
const devEndStr = "await supabaseClient.channel(\`qr-login-\${parsed.sessionId}\`).send({";
const devStart = devContent.indexOf(devStartStr);
const devEnd = devContent.indexOf(devEndStr);

if (devStart !== -1 && devEnd !== -1) {
  const newDevCrypto = `const payloadBytes = new TextEncoder().encode(payloadStr);
        
        // Import public key
        const qrPubKeyBinary = new Uint8Array(
          atob(parsed.publicKey.replace(/-----[^-]+-----/g, '').replace(/\\s+/g, ''))
            .split('')
            .map(c => c.charCodeAt(0))
        );
        const importedPubKey = await crypto.subtle.importKey(
          'spki',
          qrPubKeyBinary,
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          false,
          ['encrypt']
        );
        
        // Generate AES key for payload
        const aesKey = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt']
        );
        
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertextBuf = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          aesKey,
          payloadBytes
        );
        
        const exportedAesKey = await crypto.subtle.exportKey('raw', aesKey);
        
        const encryptedAesKeyBuf = await crypto.subtle.encrypt(
          { name: 'RSA-OAEP' },
          importedPubKey,
          exportedAesKey
        );
        
        const payloadData = {
          encKey: btoa(String.fromCharCode(...new Uint8Array(encryptedAesKeyBuf))),
          iv: btoa(String.fromCharCode(...iv)),
          cipher: btoa(String.fromCharCode(...new Uint8Array(ciphertextBuf)))
        };
        
        `;
  devContent = devContent.substring(0, devStart) + newDevCrypto + devContent.substring(devEnd);
  fs.writeFileSync('src/components/DevicesScreen.tsx', devContent);
}

let loginContent = fs.readFileSync('src/components/LoginScreen.tsx', 'utf8');
const logStartStr = "const encryptedDataStr = payload.payload.data;";
const logEndStr = "const { token, masterKeys, user } = JSON.parse(decryptedStr);";
const logStart = loginContent.indexOf(logStartStr);
const logEnd = loginContent.indexOf(logEndStr);

if (logStart !== -1 && logEnd !== -1) {
  const newLogCrypto = `const { encKey, iv, cipher } = payload.payload.data;
            const encKeyBuf = new Uint8Array(atob(encKey).split('').map(c => c.charCodeAt(0)));
            const ivBuf = new Uint8Array(atob(iv).split('').map(c => c.charCodeAt(0)));
            const cipherBuf = new Uint8Array(atob(cipher).split('').map(c => c.charCodeAt(0)));
            
            const decryptedAesKeyRaw = await crypto.subtle.decrypt(
              { name: 'RSA-OAEP' },
              privateKeyRef.current!,
              encKeyBuf
            );
            
            const aesKey = await crypto.subtle.importKey(
              'raw',
              decryptedAesKeyRaw,
              { name: 'AES-GCM' },
              false,
              ['decrypt']
            );
            
            const decryptedPayloadBuf = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: ivBuf },
              aesKey,
              cipherBuf
            );
            
            const decryptedStr = new TextDecoder().decode(decryptedPayloadBuf);
            `;
  loginContent = loginContent.substring(0, logStart) + newLogCrypto + loginContent.substring(logEnd);
  
  // also fix sending in DevicesScreen
  
  fs.writeFileSync('src/components/LoginScreen.tsx', loginContent);
}

console.log('Fixed QR crypto');
