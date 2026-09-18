const jwt = require('jsonwebtoken');
const {
  issueSessionToken,
  verifySessionToken,
  issuePurposeToken,
  verifyPurposeToken,
  SESSION_TTL,
} = require('../lib/jwt');

describe('issueSessionToken / verifySessionToken', () => {
  const user = { id: 42, email: 'rider@example.com', strava_id: '123', name: 'Rider', avatar: 'a.jpg' };

  it('round-trips the expected payload shape', () => {
    const token = issueSessionToken(user);
    const decoded = verifySessionToken(token);
    expect(decoded).toMatchObject({
      userId: 42,
      email: 'rider@example.com',
      strava_id: '123',
      name: 'Rider',
      avatar: 'a.jpg',
    });
    expect(decoded.exp).toBeTypeOf('number');
  });

  it('defaults the `tv` (token_version) claim to 0 when the user has none, and carries it through otherwise (T-4.5)', () => {
    const decoded = verifySessionToken(issueSessionToken(user));
    expect(decoded.tv).toBe(0);

    const decodedWithVersion = verifySessionToken(issueSessionToken({ ...user, token_version: 3 }));
    expect(decodedWithVersion.tv).toBe(3);
  });

  it('signs with HS256 and the configured expiry', () => {
    const token = issueSessionToken(user);
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    expect(header.alg).toBe('HS256');
    expect(SESSION_TTL).toBe('7d');
  });

  it('rejects a tampered token', () => {
    const token = issueSessionToken(user);
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'aa' ? 'bb' : 'aa');
    expect(() => verifySessionToken(tampered)).toThrow();
  });

  it('rejects a token signed with a different secret', () => {
    const token = jwt.sign({ userId: 1 }, 'a-completely-different-secret-value', {
      algorithm: 'HS256',
      expiresIn: '7d',
    });
    expect(() => verifySessionToken(token)).toThrow();
  });

  it('rejects an alg:none token even if it claims the right payload', () => {
    // Manually build an unsigned ("none" algorithm) JWT — this is the classic
    // JWT algorithm-confusion attack the explicit `algorithms: ['HS256']`
    // option on verify() is meant to close off.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ userId: 42 })).toString('base64url');
    const noneToken = `${header}.${payload}.`;
    expect(() => verifySessionToken(noneToken)).toThrow();
  });

  it('rejects an expired token', () => {
    const token = jwt.sign({ userId: 1 }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: -10 });
    expect(() => verifySessionToken(token)).toThrow(/expired/i);
  });
});

describe('issuePurposeToken / verifyPurposeToken', () => {
  it('round-trips and enforces the expected purpose', () => {
    const token = issuePurposeToken(7, 'oura_connect');
    const decoded = verifyPurposeToken(token, 'oura_connect');
    expect(decoded.userId).toBe(7);
    expect(decoded.purpose).toBe('oura_connect');
  });

  it('throws when the purpose does not match', () => {
    const token = issuePurposeToken(7, 'oura_connect');
    expect(() => verifyPurposeToken(token, 'something_else')).toThrow(/purpose/);
  });

  it('honours a custom expiry', () => {
    const token = issuePurposeToken(7, 'oura_connect', -10);
    expect(() => verifyPurposeToken(token, 'oura_connect')).toThrow(/expired/i);
  });
});
