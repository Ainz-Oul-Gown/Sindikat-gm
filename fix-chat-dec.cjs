const fs = require('fs');

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

const target1 = `            const devId = localStorage.getItem('syndicate_device_id') || 'legacy';
            const encKey = keysDict[devId] || keysDict['legacy_dev'] || keysDict['legacy'];
            cachedKey = await decryptChatKey(encKey, currentUser.id);`;

const replacement = `            let decrypted = null;
            for (const key of Object.values(keysDict)) {
              if (typeof key === 'string') {
                decrypted = await decryptChatKey(key, currentUser.id);
                if (decrypted) break;
              }
            }
            cachedKey = decrypted;`;

content = content.replace(target1, replacement);

const target2 = `              const devId = localStorage.getItem('syndicate_device_id') || 'legacy';
              let encKey = keysDict[devId] || keysDict['legacy_dev'] || keysDict['legacy'];
              cachedKey = await decryptChatKey(encKey, currentUser.id);`;

content = content.replace(target2, replacement);

const target3 = `              const devId = localStorage.getItem('syndicate_device_id') || 'legacy';
              let encKey = keysDict[devId] || keysDict['legacy_dev'] || keysDict['legacy'];
              cachedKey = await decryptChatKey(encKey, currentUser.id);`;

content = content.replace(target3, replacement);

fs.writeFileSync('src/components/ChatView.tsx', content);
console.log('Fixed chat key decryption');
