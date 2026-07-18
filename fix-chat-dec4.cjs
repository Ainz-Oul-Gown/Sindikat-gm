const fs = require('fs');
let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

const replacement = `        if (keyData) {
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
          pmAesKey = decK;
        }`;

content = content.replace(/if \(keyData\) \{\s*let encK = '';\s*try \{\s*const keysDict = JSON\.parse\(keyData\.encrypted_key\);\s*const devId = localStorage\.getItem\('syndicate_device_id'\) \|\| 'legacy';\s*encK = keysDict\[devId\] \|\| keysDict\['legacy_dev'\] \|\| keysDict\['legacy'\];\s*\} catch \(e\) \{\s*encK = keyData\.encrypted_key;\s*\}\s*pmAesKey = await decryptChatKey\(encK, currentUser\.id\);\s*\}/g, replacement);

fs.writeFileSync('src/components/ChatView.tsx', content);
