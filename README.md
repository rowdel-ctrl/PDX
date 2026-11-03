# PDX

Offline Android app: put images on pages of any size and export a PDF.
React + TypeScript, Konva, pdf-lib, Capacitor.

## Develop
    npm ci
    npm run dev          # browser preview

## APK
Every push builds an APK (GitHub Actions) and attaches it to a GitHub Release.
Without signing secrets you get a debug-signed APK, which installs fine on a phone.

Optional release signing, add these repo secrets:
- `ANDROID_KEYSTORE_BASE64` (`base64 -w0 my.keystore`)
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`

Local: `npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`

## On-device vision
Face finding and background removal run on the phone with [MediaPipe Tasks](https://github.com/google-ai-edge/mediapipe) (Apache-2.0).
The runtime and two small models (`blaze_face_short_range`, `selfie_segmenter`) are bundled in `public/mp/`, so no internet is needed.
