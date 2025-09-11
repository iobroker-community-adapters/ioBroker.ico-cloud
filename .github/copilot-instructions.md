# ioBroker ICO Cloud Adapter

**Always follow these instructions first and only fallback to additional search and context gathering if the information here is incomplete or found to be in error.**

## Overview

This is an ioBroker adapter for ICO Pool sensors by Ondilo. It connects to the Ondilo cloud service to retrieve pool measurements (temperature, pH, ORP, salt, TDS, battery, RSSI) and recommendations. The adapter runs on a schedule (once per hour by default) and stores data in ioBroker states.

## Working Effectively

### Bootstrap and Build
- **Install dependencies**: `npm ci` -- takes ~20 seconds. Use this instead of `npm install` for consistent builds.
- **Build the adapter**: `npm run build` -- takes ~5ms. Uses ESBuild for extremely fast TypeScript compilation.
- **Type checking**: `npm run check` -- runs TypeScript compiler for type validation without emitting files.
- **Watch mode**: `npm run watch` -- continuously rebuilds on file changes.

### Testing  
- **Run all tests**: `npm test` -- takes ~20ms. Runs both TypeScript unit tests and package validation.
- **TypeScript tests only**: `npm run test:ts` -- runs Mocha tests for TypeScript source files.
- **Package tests only**: `npm run test:package` -- validates package.json and io-package.json structure.
- **Integration tests**: `npm run test:integration` -- tests adapter loading and basic functionality.

### Code Quality
- **Lint code**: `npm run lint` -- runs ESLint with @iobroker/eslint-config. Takes ~2 seconds.
- **Translate**: `npm run translate` -- updates translation files in admin/i18n/.

### Release
- **Release**: `npm run release` -- uses @alcalzone/release-script for automated releases.

## Validation

### Pre-commit Validation
Always run these commands before committing changes or CI will fail:
1. `npm run build` -- ensure code compiles
2. `npm run check` -- verify TypeScript types
3. `npm run lint` -- check code style and catch errors  
4. `npm test` -- ensure all tests pass

### Manual Testing Scenarios
Since this is a background ioBroker adapter (not a UI application), manual testing involves:
- **Build validation**: Ensure `npm run build` produces clean output in `build/` directory
- **Adapter loading**: The adapter should load without errors when imported
- **Configuration**: Admin UI (JSON config) should render properly for OAuth2 setup
- **API interaction**: Adapter should handle Ondilo cloud API authentication and data retrieval

### Time Expectations
All commands are very fast due to ESBuild:
- Build: ~5ms (NEVER cancel - but it's extremely fast)
- Tests: ~20ms  
- Linting: ~2 seconds
- Type checking: ~3 seconds
- npm ci: ~20 seconds

## Project Structure

### Key Directories and Files
- `src/main.ts` -- Main adapter implementation 
- `src/lib/api.ts` -- Ondilo cloud API client with OAuth2 handling
- `admin/` -- Admin UI configuration and assets
- `admin/jsonConfig.json` -- JSON-based configuration UI definition
- `build/` -- Compiled JavaScript output (committed to allow direct GitHub installs)
- `test/` -- Mocha test files and configuration
- `io-package.json` -- ioBroker adapter metadata and configuration
- `package.json` -- Node.js project configuration

### Configuration Files
- `tsconfig.json` -- TypeScript config for development (includes test files)
- `tsconfig.build.json` -- TypeScript config for production build (excludes tests)
- `eslint.config.mjs` -- ESLint configuration using @iobroker/eslint-config
- `.github/workflows/test-and-release.yml` -- CI/CD pipeline

## Common Tasks

### Development Workflow
1. Make changes to TypeScript files in `src/`
2. Run `npm run build` to compile
3. Run `npm run lint` to check code style
4. Run `npm test` to verify tests pass
5. Use `npm run watch` during active development for automatic rebuilds

### Adding New Features
- Add TypeScript code in `src/` directory
- Update tests in corresponding `.test.ts` files
- Update translations in `admin/i18n/` if adding user-facing text
- Ensure `npm run build && npm run lint && npm test` passes

### Working with the API
- All Ondilo API interactions are in `src/lib/api.ts`
- Uses OAuth2 authentication with encrypted token storage
- API calls are rate-limited (5 requests/second, 30 requests/hour)
- Measurement types: temperature, ph, orp, salt, tds, battery, rssi

### Admin Configuration
- UI configuration is JSON-based in `admin/jsonConfig.json`
- Handles OAuth2 flow with Ondilo cloud service
- Translations are in `admin/i18n/[language]/translations.json`

## Troubleshooting

### Build Issues
- Ensure Node.js 20+ is installed (required by package.json engines field)
- Clear build directory: `npm run prebuild` or `rimraf build`
- Check TypeScript errors: `npm run check`

### Test Failures
- Run individual test suites: `npm run test:ts` or `npm run test:package`
- Check test configuration in `test/mocharc.custom.json`
- Verify test setup in `test/mocha.setup.js`

### Linting Issues
- Auto-fix issues: `npx eslint -c eslint.config.mjs . --fix`
- Check ignored files in `eslint.config.mjs`

## ioBroker Specifics

### Adapter Type
- **Schedule adapter**: Runs periodically (default every 59 minutes with random offset)
- **Mode**: "schedule" with configurable cron expression  
- **Tier**: 3 (community adapter)
- **Connection**: Cloud-based via Ondilo API

### Dependencies
- **js-controller**: >=6.0.11
- **admin**: >=7.4.10
- **Node.js**: >=20 (breaking change in v2.0.0)

### States and Objects
- Creates device objects for each pool sensor
- States for measurements: temperature, pH, ORP, salt, TDS, battery, RSSI
- Recommendation states with titles and JSON data
- Uses encrypted native config for OAuth2 tokens

## Repository Information

### Package Details
```
Repository: https://github.com/iobroker-community-adapters/ioBroker.ico-cloud
Main file: build/main.js (compiled from src/main.ts)
License: MIT
NPM: iobroker.ico-cloud
```

### Branch and Release Management
- Main branch: `main`
- CI/CD: GitHub Actions runs tests on Node.js 20.x, 22.x, 24.x
- Release: Automated via @alcalzone/release-script
- Semantic versioning with changelog in README.md