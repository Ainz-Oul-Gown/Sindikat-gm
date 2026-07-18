const fs = require('fs');

let mainContent = fs.readFileSync('src/main.tsx', 'utf8');
if (!mainContent.includes('window.deferredPrompt')) {
  mainContent = mainContent.replace(
    "if ('serviceWorker' in navigator) {",
    `window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).deferredPrompt = e;
});

if ('serviceWorker' in navigator) {`
  );
  fs.writeFileSync('src/main.tsx', mainContent);
}

let appContent = fs.readFileSync('src/App.tsx', 'utf8');
// remove the local state deferredPrompt and useEffect listener
appContent = appContent.replace(
  /const \[deferredPrompt, setDeferredPrompt\] = useState<any>\(null\);\n/g,
  ''
);

appContent = appContent.replace(
  /    const handleBeforeInstallPrompt = \(e: any\) => \{\n      e.preventDefault\(\);\n      setDeferredPrompt\(e\);\n    \};\n    window.addEventListener\('beforeinstallprompt', handleBeforeInstallPrompt\);\n/g,
  ''
);

appContent = appContent.replace(
  /window.removeEventListener\('beforeinstallprompt', handleBeforeInstallPrompt\);\n/g,
  ''
);

// find where deferredPrompt is used
appContent = appContent.replace(
  /\} else if \(deferredPrompt\) \{/g,
  `} else if ((window as any).deferredPrompt) {
                      const deferredPrompt = (window as any).deferredPrompt;`
);

appContent = appContent.replace(
  /setDeferredPrompt\(null\);/g,
  '(window as any).deferredPrompt = null;'
);

fs.writeFileSync('src/App.tsx', appContent);
console.log('Fixed prompt');
