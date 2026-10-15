import { describe, expect, it } from 'vitest';
import { isSoftwareRenderer, webglRenderer } from '../src/app/softwareGl';

describe('isSoftwareRenderer', () => {
  it('recognises software WebGL implementations', () => {
    expect(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 17.0.6, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('Microsoft Basic Render Driver')).toBe(true);
    expect(isSoftwareRenderer('Software Rasterizer')).toBe(true);
  });

  it('keeps hardware GPUs on the normal path', () => {
    expect(isSoftwareRenderer('ANGLE (Intel, Mesa Intel(R) Iris(R) Xe Graphics (TGL GT2), OpenGL 4.6)')).toBe(false);
    expect(isSoftwareRenderer('Apple M2')).toBe(false);
    expect(isSoftwareRenderer('ANGLE (NVIDIA, NVIDIA GeForce MX350 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
  });
});

describe('webglRenderer', () => {
  it('returns undefined without a document instead of throwing', () => {
    expect(webglRenderer()).toBeUndefined();
  });
});
