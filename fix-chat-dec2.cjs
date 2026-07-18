const fs = require('fs');

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

content = content.replace(/const devId = localStorage\.getItem\('syndicate_device_id'\) \|\| 'legacy';\s+let encKey = keysDict\[devId\] \|\| keysDict\['legacy_dev'\] \|\| keysDict\['legacy'\];\s+cachedKey = await decryptChatKey\(encKey, currentUser\.id\);/g, `let decrypted = null;
              for (const key of Object.values(keysDict)) {
                if (typeof key === 'string') {
                  decrypted = await decryptChatKey(key, currentUser.id);
                  if (decrypted) break;
                }
              }
              cachedKey = decrypted;`);
              
content = content.replace(/const devId = localStorage\.getItem\('syndicate_device_id'\) \|\| 'legacy';\s+const encK = keysDict\[devId\] \|\| keysDict\['legacy_dev'\] \|\| keysDict\['legacy'\];\s+let decK = await decryptChatKey\(encK, currentUser\.id\);/g, `let decK = null;
            for (const key of Object.values(keysDict)) {
              if (typeof key === 'string') {
                decK = await decryptChatKey(key, currentUser.id);
                if (decK) break;
              }
            }`);

fs.writeFileSync('src/components/ChatView.tsx', content);
console.log('Fixed chat key decryption 2');
