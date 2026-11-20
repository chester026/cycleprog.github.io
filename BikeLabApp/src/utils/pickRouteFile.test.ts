import { pick } from '@react-native-documents/picker';
import {
  isRouteFileName,
  NotARouteFileError,
  pickRouteFiles,
} from './pickRouteFile';

const pickMock = pick as unknown as jest.Mock;

describe('pickRouteFiles', () => {
  it('knows a route file by its extension', () => {
    expect(isRouteFileName('Lefkara Classic.gpx')).toBe(true);
    expect(isRouteFileName('course.FIT')).toBe(true);
    expect(isRouteFileName('photo.jpg')).toBe(false);
    expect(isRouteFileName(null)).toBe(false);
  });

  it('is null when the picker is closed', async () => {
    expect(await pickRouteFiles()).toBeNull();
  });

  it('lets several files be picked at once', async () => {
    pickMock.mockResolvedValueOnce([
      { uri: 'file:///tmp/a.gpx', name: 'a.gpx', type: null },
    ]);
    await pickRouteFiles();
    expect(pickMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowMultiSelection: true }),
    );
  });

  it('returns the picked route files in order, with a type when the system gave none', async () => {
    pickMock.mockResolvedValueOnce([
      { uri: 'file:///tmp/stage1.gpx', name: 'stage1.gpx', type: null },
      {
        uri: 'file:///tmp/stage2.fit',
        name: 'stage2.fit',
        type: 'application/vnd.ant.fit',
      },
    ]);
    expect(await pickRouteFiles()).toEqual({
      files: [
        {
          uri: 'file:///tmp/stage1.gpx',
          name: 'stage1.gpx',
          type: 'application/octet-stream',
        },
        {
          uri: 'file:///tmp/stage2.fit',
          name: 'stage2.fit',
          type: 'application/vnd.ant.fit',
        },
      ],
      skipped: 0,
    });
  });

  it('leaves other kinds of file out and counts them', async () => {
    pickMock.mockResolvedValueOnce([
      { uri: 'file:///tmp/a.pdf', name: 'a.pdf', type: 'application/pdf' },
      { uri: 'file:///tmp/a.gpx', name: 'a.gpx', type: null },
    ]);
    const picked = await pickRouteFiles();
    expect(picked?.files.map(file => file.name)).toEqual(['a.gpx']);
    expect(picked?.skipped).toBe(1);
  });

  it('refuses a selection without a route file, and passes a real picker failure on', async () => {
    pickMock.mockResolvedValueOnce([
      { uri: 'file:///tmp/a.pdf', name: 'a.pdf', type: 'application/pdf' },
    ]);
    await expect(pickRouteFiles()).rejects.toBeInstanceOf(NotARouteFileError);
    pickMock.mockRejectedValueOnce(new Error('boom'));
    await expect(pickRouteFiles()).rejects.toThrow('boom');
  });
});
