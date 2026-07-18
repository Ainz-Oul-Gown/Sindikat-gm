const fs = require('fs');

let content = fs.readFileSync('src/components/DevicesScreen.tsx', 'utf8');

const targetStr = '<div className="flex-grow overflow-y-auto flex flex-col gap-2.5">';

const newUi = `
      {isScanning ? (
        <div className="w-full aspect-square bg-black rounded-xl overflow-hidden relative mb-4">
          <Scanner 
            onScan={(result) => {
              if (result && result.length > 0) {
                handleScan(result[0].rawValue);
              }
            }} 
          />
          <button 
            onClick={() => setIsScanning(false)}
            className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg font-semibold"
          >
            Отмена
          </button>
        </div>
      ) : (
        <button 
          onClick={() => setIsScanning(true)}
          className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors mb-4 flex items-center justify-center gap-2"
        >
          <Key className="w-5 h-5 text-primary" />
          Авторизовать новое устройство (QR)
        </button>
      )}

      <div className="flex-grow overflow-y-auto flex flex-col gap-2.5">`;

content = content.replace(targetStr, newUi);

fs.writeFileSync('src/components/DevicesScreen.tsx', content);
console.log('Fixed UI');
