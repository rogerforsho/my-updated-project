# Expo development builds and mobile environments

Research checked 2026-10-21 against Expo's official documentation and this repository's mobile app configuration.

## Findings

- Expo Go can run only native libraries already included in Expo Go or libraries without custom native code. A library that adds native code must be included in an app-specific development build. The OJT app imports `@rbayuokt/expo-face-vision` from `AttendanceScreen.tsx`, and its Expo config lists the library as a plugin, so attendance camera testing requires a development build containing that native module. ([Expo: Add custom native code](https://docs.expo.dev/workflow/customizing/), [Expo: Development builds FAQ](https://docs.expo.dev/develop/development-builds/faq/))
- Expo's documented development-build setup installs `expo-dev-client`, then compiles/installs with `npx expo run:android` or `npx expo run:ios`; add `--device` for a physical phone. If a native dependency or native app config changes, rebuild the development client. JavaScript-only edits can use the existing installed client. ([Expo: Introduction to development builds](https://docs.expo.dev/develop/development-builds/introduction/), [Expo: Use development builds](https://docs.expo.dev/develop/development-builds/use-development-builds/))
- Once installed, start Metro from the Expo app directory with `npx expo start --dev-client`; `--lan` uses the local network, so a physical phone needs to reach the developer computer on that network. Expo CLI also selects a development build automatically when `expo-dev-client` is installed, but the explicit flag avoids launching Expo Go by mistake. ([Expo CLI](https://docs.expo.dev/more/expo-cli/), [Expo: Use development builds](https://docs.expo.dev/develop/development-builds/use-development-builds/))
- EAS build settings belong in `eas.json` at the Expo app root. In a monorepo, Expo says to run EAS commands from the app directory, where each app has its own `eas.json`. This repo follows that layout: `apps/mobile/eas.json`. Its `development` profile has `developmentClient: true`, internal distribution, and `environment: development`, which matches Expo's documented setup. ([Expo: EAS monorepos](https://docs.expo.dev/build-reference/build-with-monorepos/), [Expo: Configure EAS Build with eas.json](https://docs.expo.dev/build/eas-json/))
- EAS uses the named environment selected by a build profile. The repo's development profile selects EAS `development`; the preview profile selects `preview`; the production profile selects `production` and explicitly embeds the production Supabase URL/key. The development/preview profiles do not define Supabase URL/key inline. They therefore need those variables in the corresponding EAS project environments before cloud builds, or an intentional per-profile `env` configuration. For local `expo run:*`, Expo loads local `.env` files; keep local development values pointed at local services. Do not put a developer machine's LAN-only endpoint into a broadly shared EAS environment unless that is the intended device-test target. ([Expo: Using environment variables in EAS](https://docs.expo.dev/eas/environment-variables/usage/), [Expo: EAS build configuration](https://docs.expo.dev/build/eas-json/))

## Repository assessment

The required native development-client dependency and EAS development profile are already present. There is no additional Expo configuration change required just to make the project use a development build. The remaining actionable setup is operational: build and install that profile, then run Metro against it; for cloud builds, confirm the selected EAS environment has the intended Supabase URL and anon key. The mobile README already documents the environment separation and LAN requirement.

Expo's guidance does not establish whether `@rbayuokt/expo-face-vision` is compatible with this repository's specific Expo SDK / React Native versions. That compatibility still needs an actual Android development build and device camera test; the existing research note `mobile-attendance-face-detection.md` flags that as unverified.

## Safe test commands

From `apps/mobile`:

```powershell
# Local Android build, using the ignored local .env values
npx expo run:android --device

# After that build is installed, serve JavaScript to the development client
npx expo start --dev-client --lan
```

For EAS, also run commands from `apps/mobile`, select the `development` profile explicitly, and first verify its EAS `development` environment targets the intended non-production backend. Do not select the `production` profile for local testing. ([Expo: EAS monorepos](https://docs.expo.dev/build-reference/build-with-monorepos/), [Expo: EAS environment variables](https://docs.expo.dev/eas/environment-variables/usage/))
