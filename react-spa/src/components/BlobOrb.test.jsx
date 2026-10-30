import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import BlobOrb from './BlobOrb';

// jsdom has no WebGL. `fakeGl()` is the minimal surface BlobOrb touches, so
// the tests can tell "WebGL present" from "WebGL missing" and watch RAF.
function fakeGl() {
  const noop = vi.fn();
  return {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, BLEND: 8, ONE: 9, ONE_MINUS_SRC_ALPHA: 10,
    COLOR_BUFFER_BIT: 11, TRIANGLE_STRIP: 12,
    createShader: () => ({}), shaderSource: noop, compileShader: noop,
    getShaderParameter: () => true, getShaderInfoLog: () => '', deleteShader: noop,
    createProgram: () => ({}), attachShader: noop, linkProgram: noop,
    getProgramParameter: () => true, getProgramInfoLog: () => '', useProgram: noop, deleteProgram: noop,
    createBuffer: () => ({}), bindBuffer: noop, bufferData: noop, deleteBuffer: noop,
    getAttribLocation: () => 0, enableVertexAttribArray: noop, vertexAttribPointer: noop,
    getUniformLocation: () => ({}), uniform2f: noop, uniform1f: noop,
    enable: noop, blendFunc: noop, viewport: noop, clear: noop, drawArrays: vi.fn(),
  };
}

function mockMatchMedia(reduced) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

describe('BlobOrb', () => {
  let rafSpy;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    window.devicePixelRatio = 1;
  });

  it('is hidden from assistive tech', () => {
    HTMLCanvasElement.prototype.getContext = () => null;
    const { container } = render(<BlobOrb size={40} />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('falls back to a CSS gradient and schedules no frames when WebGL is unavailable', () => {
    HTMLCanvasElement.prototype.getContext = () => null;
    render(<BlobOrb size={40} />);
    expect(screen.getByTestId('blob-orb-fallback')).toBeInTheDocument();
    expect(document.querySelector('canvas')).toBeNull();
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('runs the RAF loop when WebGL is available and the orb is in view', () => {
    HTMLCanvasElement.prototype.getContext = () => fakeGl();
    render(<BlobOrb size={40} />);
    expect(rafSpy).toHaveBeenCalled();
  });

  it('draws one static frame instead of animating under prefers-reduced-motion', () => {
    const gl = fakeGl();
    HTMLCanvasElement.prototype.getContext = () => gl;
    mockMatchMedia(true);
    render(<BlobOrb size={40} />);
    expect(rafSpy).not.toHaveBeenCalled();
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
  });

  it('caps the backing-store resolution at 1.5x', () => {
    HTMLCanvasElement.prototype.getContext = () => fakeGl();
    window.devicePixelRatio = 3;
    render(<BlobOrb size={100} />);
    const canvas = document.querySelector('canvas');
    expect(canvas.width).toBe(150);
    expect(canvas.height).toBe(150);
  });

  it('stops the loop when the orb scrolls out of view', () => {
    HTMLCanvasElement.prototype.getContext = () => fakeGl();
    let observerCallback;
    const unobserve = vi.fn();
    window.IntersectionObserver = class {
      constructor(cb) {
        observerCallback = cb;
      }
      observe() {}
      unobserve = unobserve;
      disconnect() {}
    };
    render(<BlobOrb size={40} />);
    expect(rafSpy).not.toHaveBeenCalled();

    act(() => observerCallback([{ isIntersecting: true }]));
    expect(rafSpy).toHaveBeenCalledTimes(1);

    act(() => observerCallback([{ isIntersecting: false }]));
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    delete window.IntersectionObserver;
  });
});
