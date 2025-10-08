# Perp Mock Feeds

This directory stores placeholder payloads that mimic the shape of the real-time data each connector will emit. They are used for:
- Frontend prototyping before live integrations.
- Validating schema changes in `perpAdapters/*`.
- Smoke-testing analytics routines with deterministic sample values.

Once API keys are available, regenerate these files with actual snapshots and move the mock data into a test fixture workflow.
