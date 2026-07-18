const fs = require('fs');

let content = fs.readFileSync('src/components/DevicesScreen.tsx', 'utf8');

// add imports for scanner and crypto
if (!content.includes('@yudiel/react-qr-scanner')) {
  content = content.replace("import { ChevronLeft", "import { Scanner } from '@yudiel/react-qr-scanner';\nimport { ChevronLeft");
}
if (!content.includes('import * as idbKeyval')) {
  content = content.replace("import { supabaseClient }", "import * as idbKeyval from 'idb-keyval';\nimport { supabaseClient }");
}

// add states
if (!content.includes('isScanning')) {
  content = content.replace("const [loading, setLoading] = useState(false);", "const [loading, setLoading] = useState(false);\n  const [isScanning, setIsScanning] = useState(false);");
}

// add handleScan
if (!content.includes('handleScan')) {
  const func = `
  const handleScan = async (scannedData: string) => {
    try {
      const parsed = JSON.parse(scannedData);
      if (parsed.sessionId && parsed.publicKey) {
        setIsScanning(false);
        setLoading(true);
        // encrypt current token and master keys
        const token = localStorage.getItem('synd_token');
        const myPrivRsa = await idbKeyval.get(\`my_private_key_\${userId}\`);
        const myPrivEcdsa = await idbKeyval.get(\`my_sign_key_\${userId}\`);
        
        let masterKeysJSON = '';
        if (myPrivRsa && myPrivEcdsa) {
          const rsaJwk = await window.crypto.subtle.exportKey('jwk', myPrivRsa);
          const ecdsaJwk = await window.crypto.subtle.exportKey('jwk', myPrivEcdsa);
          masterKeysJSON = JSON.stringify({ rsa: rsaJwk, ecdsa: ecdsaJwk });
        }
        
        const { data: userData } = await supabaseClient.from('users').select('*').eq('id', userId).single();
        
        const payloadObj = {
          token,
          masterKeys: masterKeysJSON,
          user: userData
        };
        
        const payloadStr = JSON.stringify(payloadObj);
        const payloadBytes = new TextEncoder().encode(payloadStr);
        
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
        
        const encryptedBuffer = await crypto.subtle.encrypt(
          { name: 'RSA-OAEP' },
          importedPubKey,
          payloadBytes
        );
        
        const encryptedStr = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
        
        await supabaseClient.channel(\`qr-login-\${parsed.sessionId}\`).send({
          type: 'broadcast',
          event: 'auth-payload',
          payload: { data: encryptedStr }
        });
        
        alert('Устройство успешно авторизовано!');
      }
    } catch (e) {
      console.error('Scan error', e);
      // ignore invalid QR codes
    } finally {
      setLoading(false);
    }
  };
`;
  content = content.replace("const getDeviceId = () => {", func + "\n  const getDeviceId = () => {");
}

fs.writeFileSync('src/components/DevicesScreen.tsx', content);
console.log('Fixed devices JS');
