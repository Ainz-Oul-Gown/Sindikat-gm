const fs = require('fs');

let content = fs.readFileSync('src/components/ChatView.tsx', 'utf8');

// Fix the volume interval in startRecording
content = content.replace(
  /if \(!isRecordPaused\) \{/g,
  `if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {`
);

// Remove the recreation of interval in resumeRecording
content = content.replace(
  /\/\/ Restart volume analyzer interval[\s\S]*?\}, 150\);\n      \}/g,
  ''
);

fs.writeFileSync('src/components/ChatView.tsx', content);
console.log('Fixed intervals');
