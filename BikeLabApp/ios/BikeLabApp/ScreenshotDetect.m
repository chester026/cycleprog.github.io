#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UIKit/UIKit.h>

@interface ScreenshotDetect : RCTEventEmitter <RCTBridgeModule>
@end

@implementation ScreenshotDetect
{
  bool hasListeners;
}

RCT_EXPORT_MODULE();

- (NSArray<NSString *> *)supportedEvents {
  return @[@"onScreenshot"];
}

- (void)startObserving {
  hasListeners = YES;
}

- (void)stopObserving {
  hasListeners = NO;
}

RCT_EXPORT_METHOD(startListening) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(screenshotTaken)
                                                 name:UIApplicationUserDidTakeScreenshotNotification
                                               object:nil];
  });
}

RCT_EXPORT_METHOD(stopListening) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [[NSNotificationCenter defaultCenter] removeObserver:self
                                                    name:UIApplicationUserDidTakeScreenshotNotification
                                                  object:nil];
  });
}

- (void)screenshotTaken {
  if (hasListeners) {
    [self sendEventWithName:@"onScreenshot" body:nil];
  }
}

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

@end
