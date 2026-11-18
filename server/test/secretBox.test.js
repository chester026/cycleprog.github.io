// lib/secretBox reads its key from ../config, which is frozen at first
// require — so each case loads a fresh copy of both with the env it needs.
function loadSecretBox(key) {
  if (key) process.env.IDENTITY_TOKEN_ENC_KEY = key;
  else delete process.env.IDENTITY_TOKEN_ENC_KEY;
  for (const mod of ['../lib/secretBox', '../config']) delete require.cache[require.resolve(mod)];
  return require('../lib/secretBox');
}

describe('lib/secretBox', () => {
  it('round-trips a value and never stores it in the clear', () => {
    const box = loadSecretBox('ab'.repeat(32));
    const sealed = box.seal('apple-refresh-token');
    expect(sealed).not.toContain('apple-refresh-token');
    expect(box.open(sealed)).toBe('apple-refresh-token');
  });

  it('seals the same value differently each time', () => {
    const box = loadSecretBox('ab'.repeat(32));
    expect(box.seal('same')).not.toBe(box.seal('same'));
  });

  it('opens nothing that was tampered with or sealed under another key', () => {
    const box = loadSecretBox('ab'.repeat(32));
    const sealed = box.seal('secret');
    const [version, iv, tag, ciphertext] = sealed.split('.');
    const flipped = ciphertext.startsWith('A') ? `B${ciphertext.slice(1)}` : `A${ciphertext.slice(1)}`;
    expect(box.open([version, iv, tag, flipped].join('.'))).toBeNull();
    expect(box.open('v0.x.y.z')).toBeNull();
    expect(box.open('garbage')).toBeNull();

    expect(loadSecretBox('cd'.repeat(32)).open(sealed)).toBeNull();
  });

  it('stores nothing without a key', () => {
    const box = loadSecretBox(null);
    expect(box.isConfigured()).toBe(false);
    expect(box.seal('secret')).toBeNull();
    expect(box.open('v1.a.b.c')).toBeNull();
  });
});
