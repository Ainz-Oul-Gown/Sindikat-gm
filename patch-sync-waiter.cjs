const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  `      const channel = supabaseClient
        .channel(\`sync-waiter-\${userId}\`)`,
  `      const chName = \`sync-waiter-\${userId}\`;
      supabaseClient.getChannels().forEach(c => {
        if (c.topic === \`realtime:\${chName}\`) supabaseClient.removeChannel(c);
      });
      const channel = supabaseClient
        .channel(chName)`
);

fs.writeFileSync('src/App.tsx', content);
console.log('Patched sync waiter');
