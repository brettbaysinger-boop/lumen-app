import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';

type Props = {
  width?: number;
  height?: number;
};

export function RaialumeLogo({ width = 128, height = 80 }: Props) {
  return (
    <Svg width={width} height={height} viewBox="0 0 512 320" accessible accessibilityLabel="Raialume sunrise logo">
      <Defs>
        <LinearGradient id="raialumeSunriseGold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFE7C7" />
          <Stop offset="0.52" stopColor="#F6B46D" />
          <Stop offset="1" stopColor="#DA8759" />
        </LinearGradient>
      </Defs>
      <Path d="M256 38 L264 156 L248 156 Z" fill="url(#raialumeSunriseGold)" />
      <Path
        d="M140 219 C161 163 202 141 256 141 C310 141 351 163 372 219"
        fill="none"
        stroke="url(#raialumeSunriseGold)"
        strokeWidth={13}
        strokeLinecap="round"
      />
      <Path
        d="M46 258 C129 225 196 213 256 213 C316 213 383 225 466 258 C381 236 317 231 256 231 C195 231 131 236 46 258 Z"
        fill="url(#raialumeSunriseGold)"
      />
    </Svg>
  );
}
