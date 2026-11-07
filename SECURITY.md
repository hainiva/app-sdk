# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Email **security@epacific.com.vn** with a
description, the affected version and steps to reproduce. We acknowledge
reports within 2 business days and keep you informed until a fix ships.

## Supported versions

The latest minor release receives security fixes.

## Using the SDK safely

- **Never put your channel signing secret in the app.** Only your backend signs
  user assertions; the app fetches one from your backend when it signs in.
- Keep assertions short-lived (2 minutes) with a fresh `jti` each time.
- Store the saved session (`store`) in the platform's secure storage
  (Keychain / Android Keystore, e.g. `expo-secure-store`) where you can.
- Every release on npm is published from GitHub Actions with
  [provenance](https://docs.npmjs.com/generating-provenance-statements); check it
  with `npm audit signatures`.
