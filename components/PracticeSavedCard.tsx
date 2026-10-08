import {View,Text,Pressable} from 'react-native';
import {router} from 'expo-router';
import {useTheme} from '@/lib/theme-context';
import type {GoalSession} from '@/lib/goals';
export function PracticeSavedCard({value}:{value:unknown}){
 const {colors:c}=useTheme();
 if(!value||typeof value!=='object')return null;
 const item=value as GoalSession;
 if(typeof item.item_id!=='string'||typeof item.summary!=='string'||item.status!=='completed')return null;
 return <View style={{padding:16,borderRadius:14,borderWidth:1,borderColor:c.neutral[700],backgroundColor:c.neutral[900],gap:12,marginTop:14}}>
  <Text style={{color:c.primary[300]}}>PRACTICE SESSION · SAVED</Text>
  <Text selectable style={{color:c.neutral[100],lineHeight:23}}>{item.summary}</Text>
  {!!item.practice_notes&&<Text selectable style={{color:c.neutral[300]}}>Revisit: {item.practice_notes}</Text>}
  {!!item.vocabulary&&<Text selectable style={{color:c.neutral[300]}}>Vocabulary: {item.vocabulary}</Text>}
  {!!item.next_step&&<Text selectable style={{color:c.neutral[300]}}>Next: {item.next_step}</Text>}
  <Text style={{color:c.neutral[400],fontSize:12}}>Notes as saved at this point in the conversation. Open practice to view or edit the latest version.</Text>
  <Pressable accessibilityRole="button" onPress={()=>router.push({pathname:'/goals',params:{goal:item.item_id}})}><Text style={{color:c.primary[300]}}>Review saved practice</Text></Pressable>
 </View>;
}
