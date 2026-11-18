# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private reporting instead: open the **Security** tab of this repository and choose
**Report a vulnerability**. Include what you found, how to reproduce it, and what an attacker could do with it.

You'll get a reply as soon as possible. This is a personal project maintained by one person, so there is no fixed response time.

## Scope

In scope: the code in this repository (the `app/` folder and the deployment workflow).

Out of scope: Spotify's and Open-Meteo's own services, and copies of this app that other people host.

## Never share secrets in reports

Don't include Spotify tokens, Client Secrets, or passwords in a report. If you think one was exposed,
say so and the maintainer will rotate it.

How this app is secured is explained in [docs/SECURITY.md](docs/SECURITY.md).
