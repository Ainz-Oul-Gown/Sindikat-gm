const fs = require('fs');

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

content = content.replace(
  /mediaRecorderRef\.current\.onstop = \(\) => \{/g,
  `mediaRecorderRef.current.onstop = () => {
        clearInterval(recTimerRef.current);
        clearInterval(recordVolumeIntervalRef.current);
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(()=>{});
          audioCtxRef.current = null;
          analyserRef.current = null;
        }`
);

fs.writeFileSync('src/components/ChatView.tsx', content);
console.log('Fixed cancel');
