const fs = require('fs');

let content = fs.readFileSync('src/components/LoginScreen.tsx', 'utf8');

if (!content.includes('const [deferredPrompt, setDeferredPrompt] = useState<any>(null);')) {
  content = content.replace(
    'const [showManualLogin, setShowManualLogin] = useState(false);',
    'const [showManualLogin, setShowManualLogin] = useState(false);\n  const [deferredPrompt, setDeferredPrompt] = useState<any>((window as any).deferredPrompt || null);\n\n  useEffect(() => {\n    const handler = (e: any) => {\n      e.preventDefault();\n      setDeferredPrompt(e);\n    };\n    window.addEventListener(\'beforeinstallprompt\', handler);\n    return () => window.removeEventListener(\'beforeinstallprompt\', handler);\n  }, []);'
  );
  
  content = content.replace(
    /\{\(window as any\)\.deferredPrompt && \(/g,
    '{deferredPrompt && ('
  );
  
  content = content.replace(
    /const promptEvent = \(window as any\)\.deferredPrompt;/g,
    'const promptEvent = deferredPrompt;'
  );
  
  content = content.replace(
    /\(window as any\)\.deferredPrompt = null;/g,
    'setDeferredPrompt(null);\n                  (window as any).deferredPrompt = null;'
  );

  fs.writeFileSync('src/components/LoginScreen.tsx', content);
  console.log('Fixed PWA button state');
}
