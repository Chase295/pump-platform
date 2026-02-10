import { create } from 'zustand';

interface FullscreenState {
  isFullscreen: boolean;
  pageTitle: string;
  enter: (title: string) => void;
  exit: () => void;
}

const useFullscreenStore = create<FullscreenState>((set) => ({
  isFullscreen: false,
  pageTitle: '',
  enter: (title: string) => set({ isFullscreen: true, pageTitle: title }),
  exit: () => set({ isFullscreen: false, pageTitle: '' }),
}));

export default useFullscreenStore;
