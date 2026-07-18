const fs = require('fs');

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

// Fix waveform generation
content = content.replace(
  /const maxVol = Math\.max\(\.\.\.finalWaveform, 1\);\s*const wfString = finalWaveform\.map\(\(v\) => Math\.floor\(\(v \/ maxVol\) \* 100\)\)\.join\(\',\ '\);/,
  `const maxVol = Math.max(...finalWaveform, 10);
        const wfString = finalWaveform.map((v) => {
          // Add some dynamic variance so it doesn't look like a solid block
          const normalized = Math.min(100, Math.floor((v / maxVol) * 100));
          // Apply a bit of smoothing or noise to make it look like speech if it's too flat
          const variance = Math.random() * 15 - 7.5; 
          return Math.max(10, Math.min(100, normalized + variance));
        }).map(Math.floor).join(',');`
);

fs.writeFileSync('src/components/ChatView.tsx', content);
console.log('Patched waveform generation');
