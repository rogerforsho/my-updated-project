# Mobile environment setup

Local development uses the isolated local Supabase stack and local web portal configured in the ignored `apps/mobile/.env` file. Set `OJT_LOCAL_LAN_IP` in `.env.docker` to the computer's current Wi-Fi address; update the Supabase and portal URLs in `apps/mobile/.env` and `NEXT_PUBLIC_APP_URL` in `.env.docker` to match it. Start Compose with `docker compose --env-file .env.docker up -d --build` so the LAN address is used for its port binding.

## Device testing

The attendance screen uses `@rbayuokt/expo-face-vision`, which contains native code. Expo Go cannot load this module. With Android Studio/SDK and an Android device connected, run `npx expo run:android --device` from this directory to build and install the local development client. Then start Metro with `npx expo start --dev-client --lan` and open the project in that build. The phone and computer must be on the same Wi-Fi network.

The ignored local `.env` is used by local Expo commands. Cloud EAS builds use their selected EAS environment; configure its `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` there before building. A development build for local testing must point to the local Supabase stack and BFF, not production.

The deleted staging project is no longer available. Do not create EAS `preview` or `appetize-ios` builds until a separate non-production Supabase project is configured in the EAS `preview` environment. Non-production builds refuse to initialize against the production project. Production builds use the production EAS environment and must only be used for release.

`EXPO_PUBLIC_*` values are bundled into the app and are public, including the Supabase anon/publishable key. Never put a service-role or secret key in the mobile app or an `EXPO_PUBLIC_*` variable.
