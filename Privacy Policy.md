# CollabFM Broadcaster — Privacy Policy

*Last updated: June 28, 2026*

## Overview

CollabFM Broadcaster is a Chrome extension that captures browser tab audio and streams it to a self-hosted CollabFM server configured by the user. This policy describes what data the extension handles and how.

## Data we collect

The extension stores the following data locally in your browser using Chrome's storage API:

- Your configured CollabFM server address
- Your broadcaster display name
- Device pairing tokens and guest authentication tokens used to authenticate with your CollabFM server

No data is collected by or transmitted to the extension developer.

## Data we do not collect

The extension does not collect, transmit to us, or store:

- Personal identifying information
- Browsing history or web activity
- Location data
- Financial or health information
- Chat messages or personal communications

## Audio capture

When you start a broadcast, the extension captures audio from your selected browser tab using Chrome's tabCapture API. This audio is streamed in real time directly to your own self-hosted CollabFM server. It is never recorded, stored, or transmitted to the extension developer.

## Track metadata

The extension may read now-playing metadata (track title, artist) from supported music sources and send that metadata to your configured CollabFM server to display to listeners. This data is not collected or stored by the extension developer.

## Third parties

The extension does not share any user data with third parties. All data flows between your browser and your own self-hosted server.

## Data retention

Authentication tokens and settings stored locally can be cleared at any time by removing the extension or clearing extension storage in Chrome settings.

## Changes to this policy

If this policy changes, the updated version will be posted at this URL with a revised date.

## Contact

For questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/AlecMcCutcheon/collabfm-radio/issues).
