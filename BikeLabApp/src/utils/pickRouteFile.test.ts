import { pick } from '@react-native-documents/picker';
import {
  isRouteFileName,
  NotARouteFileError,
  pickRouteFile,
} from './pickRouteFile';

const pickMock = pick as unknown as jest.Mock;

describe('pickRouteFile', () => {
  it('knows a route file by its extension', () => {
    expect(isRouteFileName('Lefkara Classic.gpx')).toBe(true);
    expect(isRouteFileName('course.FIT')).toBe(true);
    expect(isRouteFileName('photo.jpg')).toBe(false);
    expect(isRouteFileName(null)).toBe(false);
  });

  it('is null when the picker is closed', async () => {
    expect(await pickRouteFile()).toBeNull();
  });

  it('returns the picked route file, with a type when the system gave none', async () => {
    pickMock.mockResolvedValueOnce([
      { uri: 'file:///tmp/a.gpx', name: 'a.gpx', type: null },
    ]);
    expect(await pickRouteFile()).toEqual({
      uri: 'file:///tmp/a.gpx',
      name: 'a.gpx',
      type: 'application/octet-stream',
    });
    pickMock.mockResolvedValueOnce([
      {
        uri: 'file:///tmp/b.fit',
        name: 'b.fit',
        type: 'application/vnd.ant.fit',
      },
    ]);
    expect((await pickRouteFile())?.type).toBe('application/vnd.ant.fit');
  });

  it('refuses another kind of file, and passes a real picker failure on', async () => {
    pickMock.mockResolvedValueOnce([
      { uri: 'file:///tmp/a.pdf', name: 'a.pdf', type: 'application/pdf' },
    ]);
    await expect(pickRouteFile()).rejects.toBeInstanceOf(NotARouteFileError);
    pickMock.mockRejectedValueOnce(new Error('boom'));
    await expect(pickRouteFile()).rejects.toThrow('boom');
  });
});
