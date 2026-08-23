/**
 * BlobOrb — animated "liquid" gradient orb, ported to web (WebGL) from the
 * BikeLab mobile app's React Native Skia component
 * (BikeLabApp/src/components/BlobOrb.tsx). The shader math (contour wobble,
 * domain-warped color waves, soft edge falloff) is kept 1:1 — only the
 * Skia RuntimeEffect (SkSL) source was translated to plain WebGL1 GLSL and
 * the driving clock swapped for requestAnimationFrame/performance.now().
 *
 * Usage: <BlobOrb size={72} />
 */
import React, { useEffect, useRef } from 'react';

const VERTEX_SHADER = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// Ported from BlobOrb.tsx's Skia.RuntimeEffect.Make(...) SkSL source.
const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uSize;

const vec3 WHITE  = vec3(0.985, 0.975, 1.000);
const vec3 VIOLET = vec3(0.690, 0.400, 0.860);
const vec3 BLUE   = vec3(0.200, 0.420, 0.950);
const vec3 PINK   = vec3(0.930, 0.450, 0.500);

void main() {
  vec2 xy = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  vec2 uv = (xy - 0.5 * uSize) / (0.5 * min(uSize.x, uSize.y) * 0.92);

  float t = uTime;

  float ang = atan(uv.y, uv.x);
  float wob = 0.040 * sin(3.0 * ang + 3.0 * t)
            + 0.025 * sin(5.0 * ang - 2.0 * t)
            + 0.015 * sin(7.0 * ang + 4.0 * t);
  float r = length(uv) * (1.0 - wob);

  vec2 p = uv;
  p = vec2(p.x + 0.45 * sin(p.y * 1.8 + 2.0 * t),
           p.y + 0.45 * cos(p.x * 1.6 - 2.0 * t));
  p = vec2(p.x + 0.30 * sin(p.y * 3.1 - t),
           p.y + 0.30 * sin(p.x * 2.7 + 2.0 * t));

  float a1 = t;
  float a2 = -t + 2.1;
  float w1 = p.x * cos(a1) + p.y * sin(a1);
  float w2 = p.x * cos(a2) + p.y * sin(a2);

  float bBlue = max(sin(w1 * 2.2 - 3.0 * t), sin(w2 * 1.7 + 2.0 * t));
  float bVio  = max(sin(p.x * 1.6 + p.y * 1.3 + 2.0 * t), sin(w2 * 1.9 - t + 1.0));
  float bPink = sin(w1 * 1.4 + 2.0 + t);

  float central = 1.0 - smoothstep(0.35, 1.0, r);

  vec3 col = WHITE;

  vec3 base = mix(BLUE, VIOLET, 0.5 + 0.5 * sin(t));
  col = mix(col, base, 0.35 * (1.0 - smoothstep(0.05, 0.85, r)));

  col = mix(col, VIOLET, smoothstep(0.30, 0.98, bVio)  * 0.55 * central);
  col = mix(col, BLUE,   smoothstep(0.00, 1.00, bBlue) * 0.80 * central);
  col = mix(col, PINK,   smoothstep(0.55, 1.00, bPink) * 0.30 * central);
  col = mix(col, WHITE,  smoothstep(0.48, 0.98, r) * 0.80);

  col += vec3(1.0) * ((1.0 - smoothstep(0.0, 0.9, length(uv - vec2(-0.25, -0.35)))) * 0.10);

  float alpha = 1.0 - smoothstep(0.80, 1.00, r);

  gl_FragColor = vec4(col * alpha, alpha);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('BlobOrb shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function BlobOrb({ size = 72, period = 30, className = '', style = {} }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) return; // no WebGL support — orb just stays blank, rest of the hero still works

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('BlobOrb program link error:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTimeLoc = gl.getUniformLocation(program, 'uTime');
    const uSizeLoc = gl.getUniformLocation(program, 'uSize');
    gl.uniform2f(uSizeLoc, canvas.width, canvas.height);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const TWO_PI = Math.PI * 2;
    const start = performance.now();
    let raf;
    let cancelled = false;

    const draw = () => {
      if (cancelled) return;
      const elapsed = (performance.now() - start) / 1000;
      const t = ((elapsed % period) * TWO_PI) / period;
      gl.uniform1f(uTimeLoc, t);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, [size, period]);

  return (
    <canvas
      ref={canvasRef}
      className={`blob-orb ${className}`}
      style={{ width: size, height: size, display: 'block', ...style }}
    />
  );
}
