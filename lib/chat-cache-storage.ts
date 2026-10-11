import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatCache } from './chat-cache';
export const chatCache = new ChatCache(AsyncStorage);
