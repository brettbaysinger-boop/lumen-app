import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop, Circle } from 'react-native-svg';
import { contrast, isHex } from '@/lib/appearance';
import { useTheme } from '@/lib/theme-context';

const WIDTH = 280;
const HEIGHT = 180;
const SLIDER_HEIGHT = 24;

type HSV = { h: number; s: number; v: number };

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function hsvToHex({ h, s, v }: HSV): string {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = v - chroma;

  let rgb: number[];

  if (hue < 60) rgb = [chroma, x, 0];
  else if (hue < 120) rgb = [x, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, x];
  else if (hue < 240) rgb = [0, x, chroma];
  else if (hue < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];

  return '#' + rgb.map(channel =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, '0')
  ).join('').toUpperCase();
}

function hexToHsv(hex: string): HSV {
  if (!isHex(hex)) return { h: 40, s: 0.48, v: 0.91 };

  const [r, g, b] = [1, 3, 5].map(
    offset => parseInt(hex.slice(offset, offset + 2), 16) / 255
  );

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;

  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }

  return {
    h: (h + 360) % 360,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

export function VisualColorPicker({
  value,
  onApply,
}: {
  value: string;
  onApply: (hex: string) => void;
}) {
  const { colors: c } = useTheme();
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const hsvRef = useRef(hsv);
  const [hue, setHue] = useState(() => hexToHsv(value).h);
  const hueRef = useRef(hue);

  useEffect(() => {
    const next = hexToHsv(value);
    hsvRef.current = next;
    hueRef.current = next.h;
    setHsv(next);
    setHue(next.h);
  }, [value]);

  const updateSpectrum = (x: number, y: number) => {
    const next = {
      h: hueRef.current,
      s: clamp(x / WIDTH),
      v: 1 - clamp(y / HEIGHT),
    };

    hsvRef.current = next;
    setHsv(next);
  };

  const updateHue = (x: number) => {
    const nextHue = clamp(x / WIDTH) * 359.999;
    hueRef.current = nextHue;
    setHue(nextHue);

    const next = { ...hsvRef.current, h: nextHue };
    hsvRef.current = next;
    setHsv(next);
  };

  const spectrumStart = useRef({ x: 0, y: 0 });
  const hueStart = useRef(0);

  const spectrumResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => {
      const { locationX, locationY } = event.nativeEvent;
      spectrumStart.current = { x: locationX, y: locationY };
      updateSpectrum(locationX, locationY);
    },
    onPanResponderMove: (_event, gesture) => {
      updateSpectrum(
        spectrumStart.current.x + gesture.dx,
        spectrumStart.current.y + gesture.dy
      );
    },
  })).current;

  const hueResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => {
      hueStart.current = event.nativeEvent.locationX;
      updateHue(hueStart.current);
    },
    onPanResponderMove: (_event, gesture) => {
      updateHue(hueStart.current + gesture.dx);
    },
  })).current;

  const hex = hsvToHex(hsv);
  const pureHue = hsvToHex({ h: hue, s: 1, v: 1 });

  return (
    <View style={{
      gap: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: c.neutral[700],
      borderRadius: 16,
      backgroundColor: c.neutral[900],
      alignSelf: 'flex-start',
      maxWidth: '100%',
    }}>
      <Text style={{ color: c.neutral[200], fontWeight: '600' }}>
        Choose your color
      </Text>

      <View
        accessibilityLabel="Color saturation and brightness picker"
        style={{
          width: WIDTH,
          height: HEIGHT,
          borderRadius: 12,
          overflow: 'hidden',
        }}
        {...spectrumResponder.panHandlers}
      >
        <Svg width={WIDTH} height={HEIGHT}>
          <Defs>
            <LinearGradient id="raialume-saturation" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#FFFFFF" />
              <Stop offset="100%" stopColor={pureHue} />
            </LinearGradient>
            <LinearGradient id="raialume-brightness" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#000000" stopOpacity="0" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="1" />
            </LinearGradient>
          </Defs>

          <Rect width={WIDTH} height={HEIGHT} fill="url(#raialume-saturation)" />
          <Rect width={WIDTH} height={HEIGHT} fill="url(#raialume-brightness)" />

          <Circle
            cx={hsv.s * WIDTH}
            cy={(1 - hsv.v) * HEIGHT}
            r={9}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={3}
          />
          <Circle
            cx={hsv.s * WIDTH}
            cy={(1 - hsv.v) * HEIGHT}
            r={11}
            fill="none"
            stroke="#000000"
            strokeWidth={1}
          />
        </Svg>
      </View>

      <View
        accessibilityLabel="Color hue picker"
        style={{
          width: WIDTH,
          height: SLIDER_HEIGHT,
          borderRadius: 12,
          overflow: 'hidden',
        }}
        {...hueResponder.panHandlers}
      >
        <Svg width={WIDTH} height={SLIDER_HEIGHT}>
          <Defs>
            <LinearGradient id="raialume-hue" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#FF0000" />
              <Stop offset="16.67%" stopColor="#FFFF00" />
              <Stop offset="33.33%" stopColor="#00FF00" />
              <Stop offset="50%" stopColor="#00FFFF" />
              <Stop offset="66.67%" stopColor="#0000FF" />
              <Stop offset="83.33%" stopColor="#FF00FF" />
              <Stop offset="100%" stopColor="#FF0000" />
            </LinearGradient>
          </Defs>

          <Rect width={WIDTH} height={SLIDER_HEIGHT} fill="url(#raialume-hue)" />

          <Circle
            cx={(hue / 360) * WIDTH}
            cy={SLIDER_HEIGHT / 2}
            r={9}
            fill={pureHue}
            stroke="#FFFFFF"
            strokeWidth={3}
          />
        </Svg>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: hex,
          borderWidth: 1,
          borderColor: c.neutral[500],
        }} />

        <Text style={{
          color: c.neutral[100],
          fontSize: 14,
          fontWeight: '600',
          flex: 1,
        }}>
          {hex}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Apply custom color ${hex}`}
          onPress={() => onApply(hex)}
          style={{
            backgroundColor: c.primary[400],
            paddingHorizontal: 18,
            paddingVertical: 11,
            borderRadius: 10,
          }}
        >
          <Text style={{
            color: contrast(c.primary[400], '#0C1930') >= 4.5
              ? '#0C1930'
              : '#FFFFFF',
            fontWeight: '700',
          }}>
            Apply
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
