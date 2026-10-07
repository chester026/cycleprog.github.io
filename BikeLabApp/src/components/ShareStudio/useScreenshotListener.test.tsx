import {act, renderHook} from '@testing-library/react-native';
import {AppState, NativeModules, Platform} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {useScreenshotListener} from './useScreenshotListener';
import {useTrackOpenModal} from '../../lib/openModals';

const mockRemove = jest.fn();
const mockAddListener = jest.fn();
let mockEmit: () => void = () => undefined;

jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({addListener: mockAddListener})),
}));
jest.mock('@react-navigation/native', () => ({useIsFocused: jest.fn()}));
jest.mock('../../lib/logger', () => ({logger: {debug: jest.fn()}}));

const startListening = jest.fn();
const stopListening = jest.fn();
let appStateHandler: (state: string) => void = () => undefined;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
  NativeModules.ScreenshotDetect = {startListening, stopListening};
  (useIsFocused as jest.Mock).mockReturnValue(true);
  mockAddListener.mockImplementation((_event: string, handler: () => void) => {
    mockEmit = handler;
    return {remove: mockRemove};
  });
  Object.assign(AppState, {currentState: 'active'});
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateHandler = handler as (state: string) => void;
    return {remove: jest.fn()};
  });
});

afterEach(() => {
  delete NativeModules.ScreenshotDetect;
});

describe('useScreenshotListener', () => {
  it('subscribes while focused and active, and calls onScreenshot at once', () => {
    const onScreenshot = jest.fn();
    renderHook(() => useScreenshotListener({onScreenshot}));

    expect(mockAddListener).toHaveBeenCalledWith('onScreenshot', expect.any(Function));
    expect(startListening).toHaveBeenCalledTimes(1);

    act(() => mockEmit());
    expect(onScreenshot).toHaveBeenCalledTimes(1);
  });

  it('does not listen while the screen is not focused', () => {
    (useIsFocused as jest.Mock).mockReturnValue(false);
    renderHook(() => useScreenshotListener({onScreenshot: jest.fn()}));

    expect(mockAddListener).not.toHaveBeenCalled();
    expect(startListening).not.toHaveBeenCalled();
  });

  it('removes the listener when the screen loses focus', () => {
    const {rerender} = renderHook(() => useScreenshotListener({onScreenshot: jest.fn()}));
    (useIsFocused as jest.Mock).mockReturnValue(false);
    rerender({});

    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(stopListening).toHaveBeenCalledTimes(1);
  });

  it('stops listening while the app is in the background and resumes when active', () => {
    renderHook(() => useScreenshotListener({onScreenshot: jest.fn()}));

    act(() => appStateHandler('background'));
    expect(mockRemove).toHaveBeenCalledTimes(1);

    act(() => appStateHandler('active'));
    expect(mockAddListener).toHaveBeenCalledTimes(2);
  });

  it('ignores screenshots while one of our modals is open', () => {
    const modal = renderHook(({visible}: {visible: boolean}) => useTrackOpenModal(visible), {initialProps: {visible: false}});
    renderHook(() => useScreenshotListener({onScreenshot: jest.fn()}));
    expect(mockAddListener).toHaveBeenCalledTimes(1);

    modal.rerender({visible: true});
    expect(mockRemove).toHaveBeenCalledTimes(1);

    modal.rerender({visible: false});
    expect(mockAddListener).toHaveBeenCalledTimes(2);
  });

  it('does not resubscribe when only the callback changes, and calls the latest one', () => {
    const first = jest.fn();
    const second = jest.fn();
    const {rerender} = renderHook(({cb}: {cb: () => void}) => useScreenshotListener({onScreenshot: cb}), {initialProps: {cb: first}});
    rerender({cb: second});

    expect(mockAddListener).toHaveBeenCalledTimes(1);
    act(() => mockEmit());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('is off when enabled is false', () => {
    renderHook(() => useScreenshotListener({onScreenshot: jest.fn(), enabled: false}));
    expect(mockAddListener).not.toHaveBeenCalled();
  });

  it('debounces a second event within two seconds', () => {
    const onScreenshot = jest.fn();
    renderHook(() => useScreenshotListener({onScreenshot}));
    act(() => mockEmit());
    act(() => mockEmit());
    expect(onScreenshot).toHaveBeenCalledTimes(1);
  });
});
