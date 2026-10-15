# Radiant Hospitals HMS frontend

This Next.js App Router application is part of the Radiant Hospitals HMS. For prerequisites, environment setup, backend startup, authentication bootstrap, all implementation phases, API permissions, tests, and production-hardening notes, see the repository [README](../README.md).

Run it from the repository root with:

```powershell
if (!(Test-Path .\frontend\.env.local)) { Copy-Item .\frontend\.env.example .\frontend\.env.local }
npm.cmd --prefix .\frontend install
npm.cmd --prefix .\frontend run dev
```
