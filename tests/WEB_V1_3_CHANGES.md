# Web V1.3 changes

- UI remains 100% client-side and GitHub Pages compatible.
- Validation result now exposes detected document type/sheet metadata for the UI.
- Item name is now a decisive validation field.
- Quantity validation compares Invoice vs Packing List vs Draft; Surat Jalan quantity is included when available.
- Item code/name checks include Surat Jalan when available.
- Core JavaScript syntax checks pass with Node.js.

Note: a full npm dependency install/build was not completed in this environment because the install operation timed out; no claim of a successful production build is made until dependencies are installed and `npm run build` completes.
