import { useEffect, useState } from 'react';
import { Dimensions } from 'react-native';

/** Wider than tall, by the size of the phone's whole screen. */
export function isLandscape(screen: { width: number; height: number } | null | undefined): boolean {
  return !!screen && screen.width > 0 && screen.height > 0 && screen.width > screen.height;
}

/**
 * Whether the phone's screen is sideways. Read from the SCREEN, never from the app's window: the
 * window can change shape for reasons that are not turning the phone (the keyboard in "resize"
 * mode, split screen, a pop-up window), and none of those may be mistaken for it.
 */
export function useScreenLandscape(): boolean {
  const [landscape, setLandscape] = useState(() => isLandscape(Dimensions.get('screen')));
  useEffect(() => {
    const watch = Dimensions.addEventListener('change', ({ screen }) => setLandscape(isLandscape(screen)));
    setLandscape(isLandscape(Dimensions.get('screen')));
    return () => watch.remove();
  }, []);
  return landscape;
}
