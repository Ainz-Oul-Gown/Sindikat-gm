const fs = require('fs');

let content = fs.readFileSync('src/components/LoginScreen.tsx', 'utf8');

const targetStr = `window.location.href = 'https://t.me/your_bot_name_here';`;
const newStr = `alert('Пожалуйста, откройте мини-приложение в самом Telegram на этом устройстве, или отсканируйте QR-код с уже авторизованного устройства.');`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, newStr);
  fs.writeFileSync('src/components/LoginScreen.tsx', content);
  console.log('Fixed TG button');
} else {
  console.log('Could not find TG button link');
}
