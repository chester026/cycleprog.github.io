//
//  BikeLabApp-Bridging-Header.h
//  BikeLabApp
//

#import <React/RCTLinkingManager.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
// GIDSignIn.sharedInstance.handle(url) in AppDelegate.swift — Google's
// sign-in returns to the app through the same openURL callback as bikelab://.
#import <GoogleSignIn/GoogleSignIn.h>
