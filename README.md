# flagd-ui

`flagd-ui` is a server and Web UI for managing feature flags for [OpenFeature](https://github.com/open-feature)'s `flagd` [schema](https://flagd.dev/reference/schema/).
You can use the hosted static Web App, install it locally, or run it as docker container next to you flagd instance. Find out more in the [usage examples](./examples/index.md).

This project provides a user-friendly web interface for the OpenFeature flagd service - a simple, self-contained feature flag evaluation engine. flagd is designed to be vendor-neutral and follows the OpenFeature specification.

## Features

- Easy Flag Management: Manage feature flags through a UI instead of editing JSON files
- Validates the Schema: Validates all managed files against the OpenFeature flagd schema
- Host or connect to your flag files
  - Local filesystem
  - Azure Blob Storage
  - S3 (coming soon)
  - Only in your browser (standalone mode)
- Playground for testing flag configurations and rules against your live service ([evalution.proto](https://flagd.dev/reference/cheat-sheet/?h=ofrep#grpc-evaluation-api-evaluationproto) and [OFREP](https://openfeature.dev/docs/reference/other-technologies/ofrep/))

## UI

![flagd-ui editing a flag](https://raw.githubusercontent.com/DanielHabenicht/flagd-ui/main/docs/assets/images/ui-editing-flag.png)
