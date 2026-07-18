const fs = require('fs');

let content = fs.readFileSync('src/components/DevicesScreen.tsx', 'utf8');

const targetStr = `await supabaseClient.channel(\`qr-login-\${parsed.sessionId}\`).send({
          type: 'broadcast',
          event: 'auth-payload',
          payload: { data: payloadData }
        });
        
        alert('Устройство успешно авторизовано!');`;

const newCode = `const channel = supabaseClient.channel(\`qr-login-\${parsed.sessionId}\`);
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.send({
              type: 'broadcast',
              event: 'auth-payload',
              payload: { data: payloadData }
            });
            alert('Устройство успешно авторизовано!');
            supabaseClient.removeChannel(channel);
          }
        });`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, newCode);
  fs.writeFileSync('src/components/DevicesScreen.tsx', content);
  console.log('Fixed QR send');
} else {
  console.log('Could not find QR send code');
}
