/**
 * BlobOrb — анимированный «жидкий» градиентный шар (как Siri-blob).
 * Контур мягко морфится, цветные волны перетекают внутри сферы.
 *
 * Зависимости:
 *   npm i @shopify/react-native-skia react-native-reanimated
 *   (Expo: npx expo install ... — нужен dev build, не Expo Go)
 *
 * Почему нет утечек памяти:
 *   - Шейдер компилируется ОДИН раз на уровне модуля (Skia.RuntimeEffect.Make).
 *   - Анимация — один uniform uTime от useClock(); clock автоматически
 *     останавливается при unmount, чистить ничего не нужно.
 *   - Нет покадровых bitmap'ов / setState / JS-таймеров — всё рисует GPU.
 *
 * Использование: <BlobOrb size={280} />
 */
import React from "react";
import { Canvas, Fill, Shader, Skia, useClock } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

const source = Skia.RuntimeEffect.Make(`
uniform float uTime;
uniform float2 uSize;

const half3 WHITE  = half3(0.985, 0.975, 1.000);
const half3 VIOLET = half3(0.690, 0.400, 0.860);
const half3 BLUE   = half3(0.200, 0.420, 0.950);
const half3 PINK   = half3(0.930, 0.450, 0.500);

half4 main(float2 xy) {
  // нормализация в ~[-1..1] с небольшим запасом под морфинг контура
  float2 uv = (xy - 0.5 * uSize) / (0.5 * min(uSize.x, uSize.y) * 0.92);

  // t пробегает 0..2pi за период; все временные фазы — целые кратные t,
  // поэтому анимация зацикливается ИДЕАЛЬНО (без единого скачка)
  float t = uTime; // uTime уже в радианах цикла, см. компонент ниже

  // --- морфинг контура: блоб «дышит» и меняет форму ---
  float ang = atan(uv.y, uv.x);
  float wob = 0.040 * sin(3.0 * ang + 3.0 * t)
            + 0.025 * sin(5.0 * ang - 2.0 * t)
            + 0.015 * sin(7.0 * ang + 4.0 * t);
  float r = length(uv) * (1.0 - wob);

  // --- текучий domain warp ---
  float2 p = uv;
  p = float2(p.x + 0.45 * sin(p.y * 1.8 + 2.0 * t),
             p.y + 0.45 * cos(p.x * 1.6 - 2.0 * t));
  p = float2(p.x + 0.30 * sin(p.y * 3.1 - t),
             p.y + 0.30 * sin(p.x * 2.7 + 2.0 * t));

  // --- две волны с разными направлениями/фазами:
  //     хотя бы одна всегда видима, блоб не «пропадает» ---
  float a1 = t;
  float a2 = -t + 2.1;
  float w1 = p.x * cos(a1) + p.y * sin(a1);
  float w2 = p.x * cos(a2) + p.y * sin(a2);

  float bBlue = max(sin(w1 * 2.2 - 3.0 * t), sin(w2 * 1.7 + 2.0 * t));
  float bVio  = max(sin(p.x * 1.6 + p.y * 1.3 + 2.0 * t), sin(w2 * 1.9 - t + 1.0));
  float bPink = sin(w1 * 1.4 + 2.0 + t);

  // цвета живут ближе к центру, края всегда молочные
  float central = 1.0 - smoothstep(0.35, 1.0, r);

  half3 col = WHITE;

  // гарантированная подкраска ядра: центр никогда не бывает полностью белым
  half3 base = mix(BLUE, VIOLET, half(0.5 + 0.5 * sin(t)));
  col = mix(col, base, half(0.35 * (1.0 - smoothstep(0.05, 0.85, r))));

  col = mix(col, VIOLET, half(smoothstep(0.30, 0.98, bVio)  * 0.55 * central));
  col = mix(col, BLUE,   half(smoothstep(0.00, 1.00, bBlue) * 0.80 * central));
  col = mix(col, PINK,   half(smoothstep(0.55, 1.00, bPink) * 0.30 * central));
  col = mix(col, WHITE,  half(smoothstep(0.48, 0.98, r) * 0.80));

  // мягкий блик сверху-слева
  col += half3(1.0) * half((1.0 - smoothstep(0.0, 0.9, length(uv - float2(-0.25, -0.35)))) * 0.10);

  // размытый контур
  float alpha = 1.0 - smoothstep(0.80, 1.00, r);

  return half4(col * half(alpha), half(alpha)); // premultiplied alpha
}
`)!;

type Props = {
  /** Диаметр в dp. По умолчанию 280. */
  size?: number;
  /** Длительность полного цикла, сек. По умолчанию 30. */
  period?: number;
};

const TWO_PI = Math.PI * 2;

export default function BlobOrb({ size = 280, period = 30 }: Props) {
  const clock = useClock(); // SharedValue<ms>, авто-cleanup при unmount

  const uniforms = useDerivedValue(
    () => ({
      // фаза цикла 0..2pi; модуль защищает от потери точности float
      // при долгой работе, а благодаря периодичности шейдера скачка нет
      uTime: ((clock.value / 1000) % period) * (TWO_PI / period),
      uSize: [size, size],
    }),
    [size, period]
  );

  return (
    <Canvas style={{ width: size, height: size, backgroundColor: "transparent" }}>
      <Fill>
        <Shader source={source} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
