const fs = require('fs');

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

const targetStr = `{(function() {
                          const bars = 30;
                          let displayWave = [];
                          if (recordWaveHistory.length <= bars) {
                            displayWave = [...recordWaveHistory];
                          } else {
                            const step = recordWaveHistory.length / bars;
                            for (let i = 0; i < bars; i++) {
                              const start = Math.floor(i * step);
                              const end = Math.floor((i + 1) * step);
                              const chunk = recordWaveHistory.slice(start, end);
                              const avg = chunk.length > 0 ? chunk.reduce((a, b) => a + b, 0) / chunk.length : 0;
                              displayWave.push(avg);
                            }
                          }
                          const maxVol = Math.max(...displayWave, 50);
                          return displayWave.map((vol, idx) => (
                            <div
                              key={idx}
                              className="w-1 bg-red-400 rounded-full transition-all"
                              style={{ height: \`\${Math.max(10, Math.min(100, (vol / maxVol) * 100))}%\` }}
                            />
                          ));
                        })()}`;

const newUi = `{(function() {
                          const displayWave = recordWaveHistory.slice(-30);
                          const maxVol = Math.max(...recordWaveHistory, 50);
                          return displayWave.map((vol, idx) => (
                            <div
                              key={idx}
                              className="w-1 bg-red-400 rounded-full transition-all"
                              style={{ height: \`\${Math.max(10, Math.min(100, (vol / maxVol) * 100))}%\` }}
                            />
                          ));
                        })()}`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, newUi);
  fs.writeFileSync('src/components/ChatView.tsx', content);
  console.log('Fixed recording waveform');
} else {
  console.log('Could not find target wave');
}
