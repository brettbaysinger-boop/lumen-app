import { createElement, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme-context';
import { defaultDocumentStyle, DocumentStyle, styleRequest } from '@/lib/document-style';

type PanelProps = {onChanged: () => void; disabled?: boolean; onBusyChange?: (busy: boolean) => void};

export function DocumentStylePanel(props: PanelProps) {
  const {session} = useAuth();
  const owner = session?.user.id;
  return owner ? <AccountStylePanel key={owner} owner={owner} {...props}/> : null;
}

function AccountStylePanel({owner, onChanged, disabled = false, onBusyChange}: PanelProps & {owner: string}) {
  const {colors: c} = useTheme();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<DocumentStyle>(defaultDocumentStyle);
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [preview, setPreview] = useState('');
  const mounted = useRef(true);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  useEffect(() => () => {if (preview) URL.revokeObjectURL(preview);}, [preview]);
  if (Platform.OS !== 'web') return null;
  const field = {color: c.neutral[100], backgroundColor: c.neutral[800], padding: 10, borderRadius: 8};
  const run = async (work: () => Promise<void>) => {
    if (disabled || busy) return;
    setBusy(true); onBusyChange?.(true); setError(''); setNotice('');
    try {await work();}
    catch (e) {if (mounted.current) setError(e instanceof Error ? e.message : 'Document style request failed.');}
    finally {if (mounted.current) {setBusy(false); onBusyChange?.(false);}}
  };
  const load = () => run(async () => {
    const saved = await styleRequest<DocumentStyle>(owner);
    if (mounted.current) {setStyle(saved); setLoaded(true); setPreview('');}
  });
  const change = <K extends keyof DocumentStyle>(key: K, value: DocumentStyle[K]) => {
    setStyle(current => ({...current, [key]: value})); setPreview(''); setNotice('Changes not saved yet.');
  };
  const upload = (kind: 'logo' | 'examples', files: File[]) => run(async () => {
    const max = kind === 'logo' ? 4 : 8;
    if (!files.length || files.length > (kind === 'logo' ? 1 : 2)) throw new Error('Choose one logo or up to two PDF examples.');
    if (files.some(file => file.size > max * 1024 * 1024)) throw new Error(`Each file must be at most ${max} MB.`);
    const form = new FormData();
    files.forEach(file => form.append(kind === 'logo' ? 'file' : 'files', file));
    if (kind === 'logo') {
      const result = await styleRequest<{logo_png: string}>(owner, '/logo', 'POST', form);
      if (mounted.current) {change('logo_png', result.logo_png); setNotice('Logo ready. Preview and save your style.');}
    } else {
      const result = await styleRequest<{settings: Partial<DocumentStyle>; conflicts: string[]}>(owner, '/examples', 'POST', form);
      if (mounted.current) {
        setStyle(current => ({...current, ...result.settings})); setPreview('');
        setNotice(result.conflicts.length ? 'Examples differ. The first example takes priority where they disagree; adjust and preview below.' : 'Visual settings suggested. Adjust and preview below.');
      }
    }
  });
  const button = (label: string, action: () => void, blocked = busy || disabled) => <Pressable accessibilityRole="button" disabled={blocked} onPress={action} style={{paddingVertical: 8, opacity: blocked ? .5 : 1}}><Text style={{color: c.primary[300]}}>{label}</Text></Pressable>;
  return <View style={{gap: 10}}>
    {button(open ? 'Close document style' : 'Document style · logo and examples', () => {setOpen(!open); if (!open) void load();})}
    {open && <View style={{gap: 10, padding: 12, borderWidth: 1, borderColor: c.neutral[700], borderRadius: 10}}>
      <Text style={{color: c.neutral[100]}}>Your document style</Text>
      <Text style={{color: c.neutral[300]}}>Private to your account and shared across your companions. New PDF exports use your saved style.</Text>
      {!loaded ? button(busy ? 'Loading…' : 'Reload saved style', () => void load()) : <>
        <Text style={{color: c.neutral[300]}}>Logo · PNG, JPG or WebP, up to 4 MB</Text>
        {createElement('input', {type: 'file', style: {color: c.neutral[100], maxWidth: '100%'}, accept: 'image/png,image/jpeg,image/webp', disabled: busy || disabled, 'aria-label': 'Upload your logo', onChange: (event: React.ChangeEvent<HTMLInputElement>) => {const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) void upload('logo', files);}})}
        {!!style.logo_png && <>
          {createElement('img', {src: 'data:image/png;base64,' + style.logo_png, alt: 'Your document logo', style: {maxWidth: 220, maxHeight: 90, objectFit: 'contain', background: '#fff'}})}
          {button('Remove logo from this style', () => change('logo_png', null))}
        </>}
        <Text style={{color: c.neutral[300]}}>Layout examples · one or two text-based PDFs, up to 8 MB each</Text>
        {createElement('input', {type: 'file', style: {color: c.neutral[100], maxWidth: '100%'}, accept: 'application/pdf', multiple: true, disabled: busy || disabled, 'aria-label': 'Upload layout examples', onChange: (event: React.ChangeEvent<HTMLInputElement>) => {const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) void upload('examples', files);}})}
        <Text style={{color: c.neutral[300]}}>Suggests page size, accent color and spacing from the first page. Exact layout copying and scanned examples are not supported yet. Example files and their text are not saved or used as job facts.</Text>
        <TextInput accessibilityLabel="Business name" placeholder="Business name (optional)" value={style.company_name} maxLength={120} editable={!busy && !disabled} onChangeText={v => change('company_name', v)} style={field}/>
        <TextInput accessibilityLabel="Business contact line" placeholder="Business contact details (optional)" value={style.contact_line} maxLength={240} editable={!busy && !disabled} onChangeText={v => change('contact_line', v)} style={field}/>
        <Text style={{color: c.neutral[300]}}>If the draft already contains your business details, leave these blank to avoid repeating them.</Text>
        <Text style={{color: c.neutral[300]}}>Accent color</Text>
        {createElement('input', {type: 'color', value: style.accent, disabled: busy || disabled, 'aria-label': 'Document accent color', onChange: (e: React.ChangeEvent<HTMLInputElement>) => change('accent', e.target.value)})}
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 18}}>
          {button(`Page: ${style.page_size === 'letter' ? 'Letter' : 'A4'}`, () => change('page_size', style.page_size === 'letter' ? 'a4' : 'letter'))}
          {button(`Spacing: ${style.spacing}`, () => change('spacing', style.spacing === 'compact' ? 'comfortable' : 'compact'))}
          {button(`Header: ${style.header_alignment}`, () => change('header_alignment', style.header_alignment === 'left' ? 'center' : 'left'))}
        </View>
        {button('Preview style with sample content', () => void run(async () => {
          const blob = await styleRequest<Blob>(owner, '/preview', 'POST', style, true);
          if (mounted.current) setPreview(URL.createObjectURL(blob));
        }))}
        {!!preview && createElement('iframe', {src: preview, title: 'Document style preview', style: {width: '100%', height: 480, border: 0}})}
        {button('Save as my document style', () => void run(async () => {
          const result = await styleRequest<DocumentStyle>(owner, '', 'PUT', style);
          if (mounted.current) {setStyle(result); setNotice('Saved. Preview the proposal again to use this style.'); onChanged();}
        }))}
        {button('Reset to neutral style', () => void run(async () => {
          await styleRequest(owner, '', 'DELETE');
          if (mounted.current) {setStyle({...defaultDocumentStyle}); setPreview(''); setNotice('Saved style removed. Future exports use the neutral layout.'); onChanged();}
        }))}
      </>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={{color: c.neutral[300]}}>{notice}</Text>}
      {!!error && <Text accessibilityRole="alert" style={{color: c.error[300]}}>{error}</Text>}
    </View>}
  </View>;
}
