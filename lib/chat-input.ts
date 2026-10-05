// React Native Web passes a DOM keyboard event to TextInput.onKeyPress.
export function shouldSendOnEnter(event: {
  key?: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number;
  nativeEvent?: { key?: string; isComposing?: boolean; keyCode?: number };
}): boolean {
  return (event.key ?? event.nativeEvent?.key) === 'Enter' && !event.shiftKey
    && !event.isComposing && !event.nativeEvent?.isComposing
    && event.keyCode !== 229 && event.nativeEvent?.keyCode !== 229;
}
