const fs = require('fs');

let content = fs.readFileSync('src/main.tsx', 'utf8');

if (!content.includes('virtual:pwa-register')) {
  content = content.replace("import './index.css';", "import './index.css';\nimport { registerSW } from 'virtual:pwa-register';\n\nregisterSW({ immediate: true });\n");
  fs.writeFileSync('src/main.tsx', content);
}
console.log('Fixed main.tsx SW registration');
