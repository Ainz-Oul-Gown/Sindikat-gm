const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const startStr = "if (!isAuth) {";
const endStr = "  if (activeScreen === 'sync_waiting') {";

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
  const newBlock = `if (!isAuth) {
    const isError = loadingText.includes('Вам необходимо') || loadingText.includes('Ошибка');
    return (
      <LoginScreen 
        isError={isError} 
        loadingText={loadingText} 
        onLoginSuccess={async (token, masterKeysJSON, user) => {
          localStorage.setItem('synd_token', token);
          
          if (masterKeysJSON) {
            try {
              const { rsa, ecdsa } = JSON.parse(masterKeysJSON);
              const pubEcdsa = Object.assign({}, ecdsa, { d: undefined });
              const pubRsa = Object.assign({}, rsa, { d: undefined, p: undefined, q: undefined, dp: undefined, dq: undefined, qi: undefined });
              
              const impEcdsa = await window.crypto.subtle.importKey('jwk', ecdsa, { name: 'ECDSA', namedCurve: 'P-384' }, true, ['sign']);
              const impRsa = await window.crypto.subtle.importKey('jwk', rsa, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']);
              
              await idbKeyval.set(\`my_private_key_\${user.id}\`, impRsa);
              await idbKeyval.set(\`my_sign_key_\${user.id}\`, impEcdsa);
              
              localStorage.setItem('synd_my_pubkey_cache', JSON.stringify(pubRsa));
              localStorage.setItem('synd_my_pubsign_cache', JSON.stringify(pubEcdsa));
              
            } catch (e) {
              console.error('Failed to import synced master keys:', e);
            }
          }
          window.location.reload();
        }}
      />
    );
  }

`;
  content = content.substring(0, startIndex) + newBlock + content.substring(endIndex);
  
  if (!content.includes('import { LoginScreen }')) {
    content = content.replace("import { PinScreen }", "import { PinScreen }\nimport { LoginScreen } from './components/LoginScreen';");
  }
  
  fs.writeFileSync('src/App.tsx', content);
  console.log('Fixed login render');
}
