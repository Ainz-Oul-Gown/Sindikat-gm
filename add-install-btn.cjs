const fs = require('fs');

let content = fs.readFileSync('src/components/LoginScreen.tsx', 'utf8');

const targetHtml = `<div className="text-xs text-slate-500 flex items-center gap-2 mb-6">
            <ShieldAlert className="w-4 h-4 text-emerald-500" />
            E2E Шифрование сессии
          </div>`;

const newHtml = `<div className="text-xs text-slate-500 flex items-center gap-2 mb-6">
            <ShieldAlert className="w-4 h-4 text-emerald-500" />
            E2E Шифрование сессии
          </div>

          {(window as any).deferredPrompt && (
            <button 
              onClick={async () => {
                const promptEvent = (window as any).deferredPrompt;
                if (!promptEvent) return;
                promptEvent.prompt();
                const { outcome } = await promptEvent.userChoice;
                if (outcome === 'accepted') {
                  (window as any).deferredPrompt = null;
                }
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 px-8 rounded-xl transition-colors active:scale-95 mb-3"
            >
              Установить Приложение (PWA)
            </button>
          )}`;

content = content.replace(targetHtml, newHtml);
fs.writeFileSync('src/components/LoginScreen.tsx', content);
console.log('Added install button');
