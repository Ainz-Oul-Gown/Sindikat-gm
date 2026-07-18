const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const target1 = `    // Dynamic kill switch subscription
    supabaseClient
      .channel(\`kill-switch-\${deviceId}\`)
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
      .subscribe();`;

const replacement1 = `    // Dynamic kill switch subscription
    const channelName = \`kill-switch-\${deviceId}\`;
    const existing = supabaseClient.getChannels().find((c) => c.topic === \`realtime:\${channelName}\`);
    if (!existing) {
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
        .subscribe();
    }`;

content = content.replace(target1, replacement1);


const target2 = `  const listenToSyncRequests = (userId: number) => {
    supabaseClient
      .channel(\`admin-sync-\${userId}\`)
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
      .subscribe();`;

const replacement2 = `  const listenToSyncRequests = (userId: number) => {
    const channelName = \`admin-sync-\${userId}\`;
    const existing = supabaseClient.getChannels().find((c) => c.topic === \`realtime:\${channelName}\`);
    if (!existing) {
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
        .subscribe();
    }`;

content = content.replace(target2, replacement2);

fs.writeFileSync('src/App.tsx', content);
console.log('Fixed channels');
