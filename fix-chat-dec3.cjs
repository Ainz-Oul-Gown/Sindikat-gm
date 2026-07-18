const fs = require('fs');

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

const replacement1 = `          if (data) {
            let decrypted = null;
            try {
              const keysDict = JSON.parse(data.encrypted_key);
              for (const key of Object.values(keysDict)) {
                if (typeof key === 'string') {
                  decrypted = await decryptChatKey(key, currentUser.id);
                  if (decrypted) break;
                }
              }
            } catch (e) {
              decrypted = await decryptChatKey(data.encrypted_key, currentUser.id);
            }
            cachedKey = decrypted;
            if (cachedKey) {`;

content = content.replace(/if \(data\) \{\s*let encKey = '';\s*try \{\s*const keysDict = JSON\.parse\(data\.encrypted_key\);\s*const devId = localStorage\.getItem\('syndicate_device_id'\) \|\| 'legacy';\s*encKey = keysDict\[devId\] \|\| keysDict\['legacy_dev'\] \|\| keysDict\['legacy'\];\s*\} catch \(e\) \{\s*encKey = data\.encrypted_key;\s*\}\s*cachedKey = await decryptChatKey\(encKey, currentUser\.id\);\s*if \(cachedKey\) \{/g, replacement1);

const replacement2 = `          if (keyData) {
            let decK = null;
            try {
              const keysDict = JSON.parse(keyData.encrypted_key);
              for (const key of Object.values(keysDict)) {
                if (typeof key === 'string') {
                  decK = await decryptChatKey(key, currentUser.id);
                  if (decK) break;
                }
              }
            } catch (e) {
              decK = await decryptChatKey(keyData.encrypted_key, currentUser.id);
            }
            if (decK) {`;

content = content.replace(/if \(keyData\) \{\s*let encK = '';\s*try \{\s*const keysDict = JSON\.parse\(keyData\.encrypted_key\);\s*const devId = localStorage\.getItem\('syndicate_device_id'\) \|\| 'legacy';\s*encK = keysDict\[devId\] \|\| keysDict\['legacy_dev'\] \|\| keysDict\['legacy'\];\s*\} catch \(e\) \{\s*encK = keyData\.encrypted_key;\s*\}\s*let decK = await decryptChatKey\(encK, currentUser\.id\);\s*if \(decK\) \{/g, replacement2);

fs.writeFileSync('src/components/ChatView.tsx', content);
console.log('Fixed chat key decryption 3');
