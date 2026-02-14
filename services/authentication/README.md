# Authentication Services

Supplementary Service to be independent of external Authentication Providers.

## How to make changes?

You can prototype changes (for claims etc.) in the running keycloak container. The Credentials are `admin`/`admin`. Make sure you switch to the `flagd-ui` realm before changing anything.

To modify them across restart and for all developers you have to modify the `flagd-ui-realm.json` or `flagd-ui-users-0.json`, by modifying and executing the `setup.sh` on a running keycloak instance (do not simply modify the files!).

## Current Users

The following users are currently setup. They all have the default password: `password`.

| User           | Usecase                            | Groups                           |
| -------------- | ---------------------------------- | -------------------------------- |
| user           | user                               | random_group, user_group         |
