import { forwardRef, memo, useImperativeHandle, useRef, type ReactElement } from 'react';
import { FlatList, Platform, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Message } from '@/types/database';

export interface ConversationListHandle {
  scrollToEnd(options?: { animated?: boolean }): void;
}
interface Props {
  data: Message[];
  keyExtractor: (item: Message) => string;
  renderItem: (info: { item: Message }) => ReactElement;
  contentContainerStyle?: StyleProp<ViewStyle>;
  ListFooterComponent?: ReactElement | null;
  ListEmptyComponent?: ReactElement | null;
}


interface WebMessageProps {
  item: Message;
  renderItem: Props['renderItem'];
}

const MemoizedWebMessage = memo(
  function WebMessage({ item, renderItem }: WebMessageProps) {
    return <View>{renderItem({ item })}</View>;
  },
  (previous, next) =>
    previous.item === next.item &&
    previous.renderItem === next.renderItem,
);

// Variable-height web replies must not depend on FlatList's initial render batch.
// Native retains FlatList; browser history uses a normal bounded scroll viewport.
export const ConversationList = forwardRef<ConversationListHandle, Props>((props, ref) => {
  const web = useRef<ScrollView>(null);
  const native = useRef<FlatList<Message>>(null);
  useImperativeHandle(ref, () => ({
    scrollToEnd: options => {
      if (Platform.OS === 'web') web.current?.scrollToEnd(options);
      else native.current?.scrollToEnd(options);
    },
  }), []);
  if (Platform.OS !== 'web') return <FlatList {...props} ref={native} style={{ flex: 1, minHeight: 0 }} />;
  return <ScrollView ref={web} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={props.contentContainerStyle}>
    {props.data.length ? props.data.map(item => <MemoizedWebMessage key={props.keyExtractor(item)} item={item} renderItem={props.renderItem} />) : props.ListEmptyComponent}
    {props.ListFooterComponent}
  </ScrollView>;
});
ConversationList.displayName = 'ConversationList';
