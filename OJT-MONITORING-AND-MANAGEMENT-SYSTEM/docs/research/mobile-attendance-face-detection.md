# Mobile Attendance Face Detection Research

**Reviewed:** 2026-10-21  
**Question:** What face-presence detection is available for the Expo SDK 57 attendance selfie flow, and what does it prove?

## Findings

- **`expo-camera` does not expose live face-detection events in SDK 57.** The SDK 57 `CameraView` documentation describes preview and photo capture, and its scanning callback is for barcodes. The SDK 57 API page has no `onFacesDetected` event. ([Expo Camera, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/camera/))
- **`@rbayuokt/expo-face-vision` provides the needed live camera API.** Its `FaceCamera` analyzes live frames and `useFaceValidation` reports whether exactly one face meets the configured guide. The app now uses this API to keep the shutter disabled until that validation passes. ([Project API and example](https://github.com/rbayuokt/expo-face-vision))
- **SDK 57 compatibility is unverified.** The candidate is version 0.1.1; its own development dependencies target Expo 55 and React Native 0.83.10. The app uses Expo 57 and React Native 0.86.3. Its peer dependencies allow any Expo/React Native version, but that does not establish native compatibility. Test an SDK 57 development build before relying on it. ([Candidate package metadata](https://github.com/rbayuokt/expo-face-vision/blob/main/package.json))
- **A development/native build is required; Expo Go is insufficient for this custom native module.** Expo's development-build docs explain that a development build is needed to use native libraries not included in Expo Go. The library requires a `FaceDetectionProvider`; its default behavior initializes the detector at app mount, and its docs offer deferred initialization to avoid loading it until needed. ([Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/), [library setup](https://docs.infinite.red/react-native-mlkit/face-detection/getting-started/), [deferred initialization](https://docs.infinite.red/react-native-mlkit/face-detection/advanced-usage/))
- **The library is for iOS and Android; test iOS on a physical device.** Its FAQ says the iOS ML Kit Swift API only supports arm64 device architectures, so the iOS simulator build currently fails; it recommends a physical iOS device. ([FAQ / Troubleshooting](https://docs.infinite.red/react-native-mlkit/face-detection/faq-troubleshooting/))
- **Detection means a face was found, not that it belongs to the signed-in student.** Google states ML Kit detects faces and facial features but does not recognize individuals. It does not establish liveness either: a still image can be detected without proving it came from a live person. Consequently this can reject a selfie with no detected face, but it cannot prevent someone from presenting another person's photo or prove identity. ([Google ML Kit face detection](https://developers.google.com/ml-kit/vision/face-detection/))
- **Detection can fail on valid selfies.** The library notes that faces should face the camera; small, low-resolution, turned, or partially obscured faces may not be detected. A zero-face result should let the student retake the selfie and show a clear hint; a detector error should fail closed for attendance submission and provide a retry path. ([FAQ / Troubleshooting](https://docs.infinite.red/react-native-mlkit/face-detection/faq-troubleshooting/))

## Recommendation

The project requirement is to detect exactly one face in the live camera preview and keep capture disabled until then. The mobile flow now uses `@rbayuokt/expo-face-vision` to do that locally and requires the student to press the enabled shutter. It does not provide identity verification or anti-spoof/liveness verification.

`expo-camera` has no documented SDK 57 live face event. The live-camera package is installed and configured, but it is a small, early release and its example uses Expo SDK 55. Treat native compatibility as unverified until the app builds and runs on Android and a physical iOS device. Do not claim face presence authenticates the student's identity.

The face check does not change the supervisor review requirement for attendance or the existing offline attendance review rules.
