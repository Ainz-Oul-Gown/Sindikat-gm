const fs = require('fs');

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

// For recording
content = content.replace(
  'className="w-1 bg-red-400 rounded-full transition-all"',
  'className="w-[3px] min-w-[3px] bg-red-400 rounded-[2px] transition-all"'
);

// For preview
content = content.replace(
  'className={`w-1 rounded-full transition-all ${isActive ? \'bg-primary\' : \'bg-slate-400\'}`}',
  'className={`w-[3px] min-w-[3px] rounded-[2px] transition-all ${isActive ? \'bg-primary\' : \'bg-slate-400\'}`}'
);

fs.writeFileSync('src/components/ChatView.tsx', content);
