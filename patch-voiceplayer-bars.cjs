const fs = require('fs');
let content = fs.readFileSync('src/components/VoicePlayer.tsx', 'utf8');

content = content.replace(
  'className="flex-1 rounded-[2px] transition-all min-w-[2.5px]"',
  'className="flex-1 rounded-full transition-all"'
);

content = content.replace(
  'const wfArr = waveformString.split(\',\').map(Number);',
  'const wfArr = waveformString.split(\',\').map(n => Math.max(12, Number(n)));'
);

fs.writeFileSync('src/components/VoicePlayer.tsx', content);
