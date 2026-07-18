const fs = require('fs');

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

// Fix resumeRecording
content = content.replace(
  /const resumeRecording = \(\) => \{[\s\S]*?  \};\n\n  const cancelRecording/m,
  `const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isRecordPaused) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setRecordPreviewUrl(null);
      setIsRecordPlaying(false);
      recStartTimeRef.current = Date.now();
      mediaRecorderRef.current.resume();
      setIsRecordPaused(false);

      // Restart volume analyzer interval
      if (audioCtxRef.current && analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        recordVolumeIntervalRef.current = setInterval(() => {
          if (!isRecordPaused && analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            const scale = 1 + Math.min(0.4, avg / 40);
            setMicPulseScale(scale);
            setRecordWaveHistory((prev) => [...prev, avg]);
          }
        }, 150);
      }
    }
  };

  const cancelRecording`
);

// Fix UI layout for the pause/resume
const oldUiStr = `{recordWaveHistory.slice(-20).map((vol, idx) => {
                          const isActive = idx < Math.floor(recordPreviewProgress * 20);
                          return (
                            <div
                              key={idx}
                              className={\`w-1 rounded-full transition-all \${isActive ? 'bg-primary' : 'bg-slate-400'}\`}
                              style={{ height: \`\${Math.max(10, Math.min(100, (vol / 150) * 100))}%\` }}
                            />
                          );
                        })}`;

const newUiStr = `{(function() {
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

content = content.replace(oldUiStr, newUiStr);

// Fix UI layout for recording in progress (slice 30 and dynamic max)
const oldRecUiStr = `{recordWaveHistory.slice(-15).map((vol, idx) => (
                          <div
                            key={idx}
                            className="w-1 bg-red-400 rounded-full transition-all"
                            style={{ height: \`\${Math.max(10, Math.min(100, (vol / 150) * 100))}%\` }}
                          />
                        ))}`;

const newRecUiStr = `{(function() {
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

content = content.replace(oldRecUiStr, newRecUiStr);

fs.writeFileSync('src/components/ChatView.tsx', content);
console.log('Fixed');
