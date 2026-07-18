const fs = require('fs');

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

// fix flex overflow in record overlay
content = content.replace(
  '<div className="flex items-center justify-center flex-grow">',
  '<div className="flex items-center justify-center flex-grow min-w-0 overflow-hidden">'
);

content = content.replace(
  '<div className="flex items-center gap-3 bg-slate-800/50 py-1 px-3 rounded-full flex-grow mx-2">',
  '<div className="flex items-center gap-2 bg-slate-800/50 py-1 px-3 rounded-full flex-grow mx-2 min-w-0">'
);

fs.writeFileSync('src/components/ChatView.tsx', content);
console.log('Patched overlay overflow');
