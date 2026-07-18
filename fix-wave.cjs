const fs = require('fs');

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

// The paused/playing preview wave logic
const funcPreviewStr = `{(function() {
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
                          
                          return displayWave.map((vol, idx) => {
                            const isActive = idx < Math.floor(recordPreviewProgress * displayWave.length);
                            return (
                              <div
                                key={idx}
                                className={\`w-1 rounded-full transition-all \${isActive ? 'bg-primary' : 'bg-slate-400'}\`}
                                style={{ height: \`\${Math.max(10, Math.min(100, (vol / maxVol) * 100))}%\` }}
                              />
                            );
                          });
                        })()}`;

// The recording-in-progress wave logic
const funcRecStr = `{(function() {
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

// Replace the old rec ui
const oldRecUiStr = `{(function() {
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

content = content.replace(oldRecUiStr, funcRecStr);

fs.writeFileSync('src/components/ChatView.tsx', content);
console.log('Fixed wave compression');
