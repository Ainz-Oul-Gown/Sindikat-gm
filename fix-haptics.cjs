const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'components');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // The sed script left `hapticImpact("xxx");\n      }` or similar
  // We need to remove the trailing `}` that belonged to the if statement.
  
  // Regex to match hapticImpact followed by optional whitespace and a single closing brace on its own line
  content = content.replace(/(hapticImpact\("[^"]+"\);)\s*\n\s*\}/g, '$1');
  
  // Also settings modal had:
  // if (checked && window.Telegram?.WebApp?.HapticFeedback) {
  //   hapticImpact("medium");
  // }
  // We should fix that too
  content = content.replace(/if\s*\([^\{]*HapticFeedback\)[^\{]*\{\s*(hapticImpact\("[^"]+"\);)\s*\}/g, '$1');

  fs.writeFileSync(filePath, content);
}

// And check App.tsx just in case
let appContent = fs.readFileSync('src/App.tsx', 'utf8');
appContent = appContent.replace(/(hapticImpact\("[^"]+"\);)\s*\n\s*\}/g, '$1');
fs.writeFileSync('src/App.tsx', appContent);

console.log('Fixed');
