const fs = require('fs');
let content = fs.readFileSync('vite.config.ts', 'utf8');

content = content.replace(
  "type: 'image/png'\n            },",
  "type: 'image/png',\n              purpose: 'any maskable'\n            },"
);
content = content.replace(
  "type: 'image/png'\n            }",
  "type: 'image/png',\n              purpose: 'any maskable'\n            }"
);

fs.writeFileSync('vite.config.ts', content);
