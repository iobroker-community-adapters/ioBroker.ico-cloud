# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

**ioBroker ICO Cloud Adapter**: This is an ioBroker adapter for ICO Pool sensors by Ondilo. It connects to the Ondilo cloud service to retrieve pool measurements (temperature, pH, ORP, salt, TDS, battery, RSSI) and recommendations. The adapter runs on a schedule (once per hour by default) and stores data in ioBroker states.

Key features:
- **API**: Ondilo cloud API client with OAuth2 handling in `src/lib/api.ts`
- **Authentication**: OAuth2 authentication with encrypted token storage
- **Rate limiting**: API calls are rate-limited (5 requests/second, 30 requests/hour)
- **Measurements**: temperature, ph, orp, salt, tds, battery, rssi
- **Scheduling**: Runs periodically (default every 59 minutes with random offset)
- **Configuration**: JSON-based admin UI with OAuth2 flow
- **Build system**: ESBuild for extremely fast TypeScript compilation (~5ms builds)

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', () => new Promise(async (resolve) => {
                // Get adapter object and configure
                harness.objects.getObject('system.adapter.brightsky.0', async (err, obj) => {
                    if (err) {
                        console.error('Error getting adapter object:', err);
                        resolve();
                        return;
                    }

                    // Configure adapter properties
                    obj.native.position = TEST_COORDINATES;
                    obj.native.createCurrently = true;
                    obj.native.createHourly = true;
                    obj.native.createDaily = true;
                    // ... other configuration

                    // Set the updated configuration
                    harness.objects.setObject(obj._id, obj);

                    // Start adapter and wait
                    await harness.startAdapterAndWait();

                    // Wait for adapter to process data
                    setTimeout(() => {
                        // Verify states were created
                        harness.states.getState('brightsky.0.info.connection', (err, state) => {
                            if (state && state.val === true) {
                                console.log('✅ Adapter started successfully');
                            }
                            resolve();
                        });
                    }, 15000); // Allow time for API calls
                });
            })).timeout(30000);
        });
    }
});
```

#### Testing Both Success AND Failure Scenarios

**IMPORTANT**: For every "it works" test, implement corresponding "it doesn't work and fails" tests. This ensures proper error handling and validates that your adapter fails gracefully when expected.

```javascript
// Example: Testing successful configuration
it('should configure and start adapter with valid configuration', () => new Promise(async (resolve) => {
    // ... successful configuration test as shown above
})).timeout(30000);

// Example: Testing failure scenarios
it('should fail gracefully with invalid configuration', () => new Promise(async (resolve) => {
    harness.objects.getObject('system.adapter.brightsky.0', async (err, obj) => {
        if (err) {
            console.error('Error getting adapter object:', err);
            resolve();
            return;
        }

        // Configure with invalid data to test error handling
        obj.native.position = ''; // Invalid empty position
        obj.native.createCurrently = true;

        harness.objects.setObject(obj._id, obj);
        await harness.startAdapterAndWait();

        setTimeout(() => {
            // Check that adapter handles the error gracefully
            harness.states.getState('brightsky.0.info.connection', (err, state) => {
                if (!state || state.val === false) {
                    console.log('✅ Adapter correctly failed with invalid config');
                } else {
                    console.log('❌ Expected adapter to fail but it succeeded');
                }
                resolve();
            });
        }, 10000);
    });
})).timeout(20000);
```

#### Advanced State Access Patterns

The testing framework provides multiple ways to access adapter states. Use the most appropriate pattern for your test scenario:

```javascript
// 1. Direct state access (fastest, for simple checks)
const state = await harness.states.getStateAsync('adapter.0.state.name');

// 2. Promise-based state access (good for integration tests)
harness.states.getState('adapter.0.state.name', (err, state) => {
    if (err) {
        console.error('Error accessing state:', err);
        return;
    }
    console.log('State value:', state.val);
});

// 3. Callback pattern with error handling
harness.states.getState('adapter.0.state.name', (err, state) => {
    if (err) {
        console.error('State access failed:', err);
        resolve();
        return;
    }
    
    if (state && state.val === expectedValue) {
        console.log('✅ State value matches expected');
        resolve();
    } else {
        console.log(`❌ Expected ${expectedValue}, got ${state?.val}`);
        resolve();
    }
});

// 4. Object access for configuration verification
harness.objects.getObject('adapter.0', (err, obj) => {
    if (err) {
        console.error('Object access failed:', err);
        return;
    }
    
    // Verify adapter configuration
    assert.strictEqual(obj.native.someConfigValue, 'expected');
});
```

#### Key Integration Testing Rules

1. **Always use `tests.integration()`** - Never write custom integration test setups
2. **Use `defineAdditionalTests({ suite })`** for custom test scenarios
3. **Always use `.timeout()` with appropriate values** (minimum 20 seconds for API calls)
4. **Use `Promise` patterns** or `async/await` for asynchronous operations
5. **Test both success and failure scenarios** for comprehensive coverage
6. **Use `setTimeout()` for timing-dependent tests** (API calls, state updates)
7. **Always handle errors gracefully** in test callbacks
8. **Log meaningful messages** to help debug test failures

#### Workflow Dependencies

Some adapters depend on specific workflow environments or external systems. Use environment variables to control test execution:

```javascript
// Skip integration tests in CI if external dependencies are not available
if (process.env.CI && !process.env.API_CREDENTIALS) {
    console.log('Skipping integration tests - no API credentials in CI');
    return;
}
```

#### What NOT to Do

❌ **DON'T** write custom adapter loading logic
❌ **DON'T** manually start/stop ioBroker instances
❌ **DON'T** use external testing frameworks for ioBroker integration tests
❌ **DON'T** skip error handling in test callbacks
❌ **DON'T** use hardcoded timeouts without considering CI environments

#### What TO Do

✅ **DO** use `@iobroker/testing` framework exclusively
✅ **DO** test error conditions alongside success scenarios
✅ **DO** use appropriate timeouts for different types of operations
✅ **DO** provide clear console output for test debugging
✅ **DO** validate both states and objects in tests
✅ **DO** handle asynchronous operations properly

### API Testing with Credentials

For adapters that connect to external APIs requiring credentials, implement separate test files that can run with demo or test credentials.

#### Password Encryption for Integration Tests

Many ioBroker adapters store passwords encrypted in the native configuration. Here's how to properly handle password encryption in integration tests:

```javascript
// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Usage in integration tests
const encryptedPassword = await encryptPassword(harness, "your_test_password");
await harness.changeAdapterConfig("your-adapter", {
    native: {
        username: "test@example.com",
        password: encryptedPassword,
    }
});
```

#### Demo Credentials Testing Pattern

Create a separate test file for API connectivity testing:

```javascript
// test/integration-demo.js
const path = require("path");
const { tests } = require("@iobroker/testing");

tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            // Test implementation here
        });
    }
});
```

#### Enhanced Test Failure Handling

Provide clear failure messages that help diagnose the specific issue:

```javascript
it("Should connect to API with demo credentials", async () => {
    // ... test setup
    
    const connectionState = await harness.states.getStateAsync("adapter.0.info.connection");
    
    if (connectionState && connectionState.val === true) {
        console.log("✅ SUCCESS: API connection established");
        return true;
    } else {
        throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
            "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
    }
}).timeout(120000);
```

## README Updates

### Required Sections

Your adapter README.md MUST include these sections with accurate information:

1. **Installation** - Installation instructions
2. **Configuration** - How to configure the adapter
3. **Usage** - How to use the adapter features
4. **Troubleshooting** - Common issues and solutions
5. **Changelog** - Version history with changes
6. **License** - License information

### Documentation Standards

- Use clear, concise language
- Include code examples where helpful
- Document all configuration options
- Explain error messages and their solutions
- Update documentation with each feature change

### Mandatory README Updates for PRs

All PRs that add or modify functionality MUST include corresponding README updates:

- New features → Add to Usage section
- Configuration changes → Update Configuration section  
- Bug fixes → Note in Troubleshooting if user-facing
- Breaking changes → Prominently document in Changelog

### Documentation Workflow Standards

1. Update README before finalizing PR
2. Use consistent formatting and style
3. Test all documented procedures
4. Include screenshots for UI changes

### Changelog Management with AlCalzone Release-Script

The changelog should be managed by @alcalzone/release-script. Follow these patterns:

#### Format Requirements

```markdown
## Changelog

### **WORK IN PROGRESS**
- (author) feature description
- (author) fix description

### v1.2.3 (2023-01-15)
- (author) Added new feature X
- (author) Fixed issue with Y
- (author) Updated dependency Z to version A.B.C

## **WORK IN PROGRESS**

### v0.1.0 (2023-01-01)
- (author) Initial release
```

#### Workflow Process

1. Add entries under `**WORK IN PROGRESS**` section
2. Use format: `- (author) description`
3. Use present tense for descriptions
4. Group by type: features first, then fixes, then updates
5. Let release-script move entries to proper version sections

#### Change Entry Format

- `(author) Added new feature X` - for new features
- `(author) Fixed issue with Y` - for bug fixes  
- `(author) Updated dependency Z` - for dependency updates
- `(author) Breaking: Changed API method signature` - for breaking changes

#### Example Entry

```markdown
## **WORK IN PROGRESS**

### v0.1.0 (2023-01-01)
- (garfonso) Initial release
- (garfonso) Added support for pool temperature monitoring  
- (garfonso) Fixed OAuth2 token refresh handling
```

## Dependency Updates

### Package Management

- Use `npm ci` for consistent builds (not `npm install`)
- Pin dependency versions appropriately
- Test dependency updates thoroughly
- Document breaking changes from dependency updates

### Dependency Best Practices

- Minimize dependency count
- Use well-maintained, popular packages
- Avoid packages with security vulnerabilities
- Regular dependency audits with `npm audit`

## JSON-Config Admin Instructions

### Configuration Schema

The adapter uses JSON-based configuration in `admin/jsonConfig.json`. Follow this pattern for OAuth2 integrations:

```json
{
  "type": "panel",
  "items": {
    "_oauth": {
      "type": "oauth",
      "provider": "ondilo",
      "clientId": "customer_api",
      "scope": "api",
      "authorizationUrl": "https://interop.ondilo.com/oauth2/authorize",
      "tokenUrl": "https://interop.ondilo.com/oauth2/token"
    }
  }
}
```

### Admin Interface Guidelines

- Use clear, descriptive labels
- Group related settings logically
- Provide helpful descriptions for complex options
- Use appropriate input types (text, number, checkbox, etc.)
- Implement validation where appropriate

## Best Practices for Dependencies

### HTTP Client Libraries

- **Preferred**: Use built-in `fetch` or `axios` for HTTP requests
- **Avoid**: Request library (deprecated), custom HTTP implementations

### Example with fetch:

```javascript
// Modern fetch usage
try {
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
} catch (error) {
    this.log.error(`API request failed: ${error.message}`);
    throw error;
}
```

### Other Dependency Recommendations

- **Logging**: Use adapter's built-in `this.log` methods
- **Configuration**: Use adapter's `this.config` for settings
- **Timers**: Use adapter's timer management for cleanup

## Error Handling

### Adapter Error Patterns

Always implement proper error handling in your adapter:

```javascript
// Proper error handling in adapter methods
async onReady() {
    try {
        await this.initializeAdapter();
        await this.startPolling();
    } catch (error) {
        this.log.error(`Failed to initialize adapter: ${error.message}`);
        this.terminate ? this.terminate(11) : process.exit(11);
    }
}
```

### Example Error Handling:

```javascript
// API call error handling
try {
    const data = await this.api.getData();
    await this.processData(data);
} catch (error) {
    if (error.response?.status === 401) {
        this.log.error('API authentication failed - check credentials');
    } else if (error.code === 'ENOTFOUND') {
        this.log.error('Network error - check internet connection');
    } else {
        this.log.error(`Unexpected API error: ${error.message}`);
    }
}
```

### Timer and Resource Cleanup:

```javascript
class MyAdapter extends utils.Adapter {
    private pollTimer?: NodeJS.Timeout;
    private connectionTimer?: NodeJS.Timeout;

    private async onReady(): Promise<void> {
        this.pollTimer = setInterval(() => {
            this.poll().catch(error => {
                this.log.error(`Polling error: ${error.message}`);
            });
        }, 60000);
    }

    private onUnload(callback: () => void): void {
        try {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
                this.pollTimer = undefined;
            }
            if (this.connectionTimer) {
                clearInterval(this.connectionTimer);
                this.connectionTimer = undefined;
            }
            // Close connections, clean up resources
            callback();
        } catch (e) {
            callback();
        }
    }
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

**ICO Cloud Adapter Specific Standards:**
- All Ondilo API interactions are in `src/lib/api.ts`
- Uses OAuth2 authentication with encrypted token storage
- API calls are rate-limited (5 requests/second, 30 requests/hour)
- Measurement types: temperature, ph, orp, salt, tds, battery, rssi
- UI configuration is JSON-based in `admin/jsonConfig.json`
- Handles OAuth2 flow with Ondilo cloud service
- Translations are in `admin/i18n/[language]/translations.json`

Build System:
- **Install dependencies**: `npm ci` -- takes ~20 seconds
- **Build the adapter**: `npm run build` -- takes ~5ms using ESBuild
- **Type checking**: `npm run check` -- runs TypeScript compiler
- **Watch mode**: `npm run watch` -- continuously rebuilds on changes
- **Lint code**: `npm run lint` -- runs ESLint with @iobroker/eslint-config
- **Run all tests**: `npm test` -- takes ~20ms
- **Release**: `npm run release` -- uses @alcalzone/release-script

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

**ICO Cloud Specific Implementation Notes:**
- Replace "your-adapter" with "ico-cloud" 
- Configure OAuth2 credentials instead of username/password
- Test Ondilo API connectivity and pool data retrieval
- Verify recommendation states are created properly
- Test rate limiting behavior (5 requests/second, 30 requests/hour)