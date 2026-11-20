import {Alert} from 'react-native';
import {act, renderHook} from '@testing-library/react-native';
import {useRouteAttachments} from './useRouteAttachments';
import {NotARouteFileError, pickRouteFiles} from '../../utils/pickRouteFile';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}));
jest.mock('../../utils/pickRouteFile', () => ({
  ...jest.requireActual('../../utils/pickRouteFile'),
  pickRouteFiles: jest.fn(),
}));
const mockUpload = jest.fn();
jest.mock('../../data/hooks/useUploadRaceCourse', () => ({
  useUploadRaceCourse: () => ({mutateAsync: mockUpload}),
}));
jest.mock('../../lib/logger', () => ({logger: {error: jest.fn()}}));

const pickMock = pickRouteFiles as jest.Mock;
const file = (name: string) => ({uri: `file:///tmp/${name}`, name, type: 'application/octet-stream'});
const course = (id: number, name: string) => ({course_id: id, name, distance_km: 90, elevation_gain_m: 1500, climbs: []});

describe('useRouteAttachments', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    pickMock.mockReset();
    mockUpload.mockReset();
  });
  afterEach(() => alert.mockRestore());

  it('reads every picked file, in order, and keeps the routes until they are sent', async () => {
    pickMock.mockResolvedValue({files: [file('stage1.gpx'), file('stage2.gpx'), file('stage3.fit')], skipped: 0});
    mockUpload
      .mockResolvedValueOnce(course(21, 'Stage 1'))
      .mockResolvedValueOnce(course(22, 'Stage 2'))
      .mockResolvedValueOnce(course(23, 'Stage 3'));
    const {result} = renderHook(() => useRouteAttachments());

    await act(() => result.current.attach());
    expect(mockUpload.mock.calls.map(([f]) => f.name)).toEqual(['stage1.gpx', 'stage2.gpx', 'stage3.fit']);
    expect(result.current.attached.map(route => route.course_id)).toEqual([21, 22, 23]);
    expect(result.current.uploading).toBe(false);
    expect(alert).not.toHaveBeenCalled();

    act(() => result.current.remove(22));
    expect(result.current.attached.map(route => route.course_id)).toEqual([21, 23]);
    act(() => result.current.clear());
    expect(result.current.attached).toEqual([]);
  });

  it('adds to what is already attached, and the same route twice is one route', async () => {
    pickMock.mockResolvedValueOnce({files: [file('stage1.gpx')], skipped: 0}).mockResolvedValueOnce({files: [file('stage1.gpx'), file('stage2.gpx')], skipped: 0});
    mockUpload.mockResolvedValueOnce(course(21, 'Stage 1')).mockResolvedValueOnce(course(21, 'Stage 1')).mockResolvedValueOnce(course(22, 'Stage 2'));
    const {result} = renderHook(() => useRouteAttachments());

    await act(() => result.current.attach());
    await act(() => result.current.attach());
    expect(result.current.attached.map(route => route.course_id)).toEqual([21, 22]);
  });

  it('a file that cannot be read does not stop the others, and is named once at the end', async () => {
    pickMock.mockResolvedValue({files: [file('stage1.gpx'), file('flat.gpx'), file('stage3.gpx')], skipped: 0});
    mockUpload
      .mockResolvedValueOnce(course(21, 'Stage 1'))
      .mockRejectedValueOnce(Object.assign(new Error('no elevation'), {name: 'ApiError', code: 'COURSE_NO_ELEVATION', status: 422}))
      .mockResolvedValueOnce(course(23, 'Stage 3'));
    const {result} = renderHook(() => useRouteAttachments());

    await act(() => result.current.attach());
    expect(result.current.attached.map(route => route.course_id)).toEqual([21, 23]);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe('coach.routeFailedTitle');
    expect(alert.mock.calls[0][1]).toContain('"name":"flat.gpx"');
  });

  it('takes five routes a message: the picker does not open when full, and extra files are left out with a note', async () => {
    const six = Array.from({length: 6}, (_, i) => file(`stage${i + 1}.gpx`));
    pickMock.mockResolvedValue({files: six, skipped: 0});
    mockUpload.mockImplementation(async (f: {name: string}) => course(Number(f.name.match(/\d+/)?.[0]), f.name));
    const {result} = renderHook(() => useRouteAttachments());

    await act(() => result.current.attach());
    expect(result.current.attached).toHaveLength(5);
    expect(mockUpload).toHaveBeenCalledTimes(5);
    expect(alert.mock.calls[0][0]).toBe('coach.routeLimitTitle {"max":5}');

    await act(() => result.current.attach());
    expect(pickMock).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it('says so when the selection held other kinds of file, or nothing that is a route', async () => {
    pickMock.mockResolvedValueOnce({files: [file('stage1.gpx')], skipped: 1});
    mockUpload.mockResolvedValueOnce(course(21, 'Stage 1'));
    const {result} = renderHook(() => useRouteAttachments());
    await act(() => result.current.attach());
    expect(result.current.attached).toHaveLength(1);
    expect(alert.mock.calls[0][0]).toBe('coach.routeNotARouteTitle');

    pickMock.mockRejectedValueOnce(new NotARouteFileError());
    await act(() => result.current.attach());
    expect(alert).toHaveBeenCalledTimes(2);
    expect(mockUpload).toHaveBeenCalledTimes(1);

    // The picker closed without a choice: nothing happens.
    pickMock.mockResolvedValueOnce(null);
    await act(() => result.current.attach());
    expect(alert).toHaveBeenCalledTimes(2);
  });
});
