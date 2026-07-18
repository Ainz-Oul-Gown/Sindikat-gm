const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  /const channelName = `kill-switch-\$\{deviceId\}`;[\s\S]*?\.subscribe\(\);\n    \}/,
  `const channelName = \`kill-switch-\$\{deviceId\}\`;
    supabaseClient.getChannels().forEach(c => {
      if (c.topic === \`realtime:\${channelName}\`) supabaseClient.removeChannel(c);
    });
    supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'user_devices', filter: \`device_id=eq.\${deviceId}\` },
        async () => {
          await idbKeyval.clear();
          localStorage.clear();
          alert('Сеанс завершен: Устройство удалено из аккаунта.');
          window.location.reload();
        }
      )
      .subscribe();`
);

content = content.replace(
  /const channelName = `admin-sync-\$\{userId\}`;[\s\S]*?\.subscribe\(\);\n    \}/,
  `const channelName = \`admin-sync-\$\{userId\}\`;
    supabaseClient.getChannels().forEach(c => {
      if (c.topic === \`realtime:\${channelName}\`) supabaseClient.removeChannel(c);
    });
    supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'device_requests', filter: \`user_id=eq.\${userId}\` },
        (payload: any) => {
          const req = payload.new;
          if (req && req.status === 'pending') {
            setPendingSyncRequest(req);
          }
        }
      )
      .subscribe();`
);

fs.writeFileSync('src/App.tsx', content);
console.log('Patched channel recreation');
