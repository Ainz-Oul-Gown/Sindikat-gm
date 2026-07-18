export function hapticImpact(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection' = 'light') {
  const isHapticsEnabled = localStorage.getItem('synd_haptics') !== 'off';
  if (!isHapticsEnabled) return;

  const tg = (window as any).Telegram?.WebApp;
  
  if (tg?.HapticFeedback) {
    if (type === 'light' || type === 'medium' || type === 'heavy') {
      tg.HapticFeedback.impactOccurred(type);
    } else if (type === 'success' || type === 'warning' || type === 'error') {
      tg.HapticFeedback.notificationOccurred(type);
    } else if (type === 'selection') {
      tg.HapticFeedback.selectionChanged();
    }
    return;
  }

  // Fallback to Web Vibration API for Android Chrome/PWA
  if (navigator.vibrate) {
    if (type === 'light') navigator.vibrate(10);
    else if (type === 'medium') navigator.vibrate(20);
    else if (type === 'heavy') navigator.vibrate(40);
    else if (type === 'success') navigator.vibrate([10, 30, 20]);
    else if (type === 'warning') navigator.vibrate([20, 20, 20]);
    else if (type === 'error') navigator.vibrate([30, 40, 30, 40, 40]);
    else if (type === 'selection') navigator.vibrate(5);
  }
}
