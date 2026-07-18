interface Window {
  Telegram?: {
    WebApp?: {
      ready: () => void;
      expand: () => void;
      initData: string;
      initDataUnsafe?: {
        receiver?: {
          platform?: string;
        };
      };
      HapticFeedback?: {
        impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
        notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
        selectionChanged: () => void;
      };
    };
  };
}

interface ImportMeta {
  readonly env: Record<string, string>;
}
