# PR: Improve Agent SDK & Add Gemini Live Skybox Sample

## 🎯 Overview

This PR improves the Agent SDK with standardized error handling, lifecycle management, and better audio control. It also adds a new sample demonstrating real-time skybox generation using Gemini Live AI.

## 🚀 Key Improvements

### 1. **Standardized Tool Result Type** (`ToolResult<T>`)
- Added structured result type with `success`, `data`, `error`, and `metadata` fields
- All tools now return consistent, type-safe results
- Automatic metadata tracking (execution time, tool name)

**Before:**
```typescript
override async execute(args: {prompt: string}): Promise<string> {
  // Returns raw string, error handling inconsistent
}
```

**After:**
```typescript
override async execute(args: {prompt: string}): Promise<ToolResult<string>> {
  return {
    success: true,
    data: 'Skybox generated successfully.',
    metadata: {prompt: args.prompt, timestamp: Date.now()}
  };
}
```

### 2. **Agent Lifecycle Callbacks**
- Added `AgentLifecycleCallbacks` interface with hooks for session events
- Enables custom logic on session start/end, tool execution, and errors
- Better observability and debugging capabilities

```typescript
const agent = new xb.SkyboxAgent(ai, sound, scene, {
  onSessionStart: () => updateUI('active'),
  onSessionEnd: () => updateUI('inactive'),
  onError: (error) => showError(error)
});
```

### 3. **Explicit Audio Lifecycle Management**
- **Breaking Change**: Removed automatic audio enabling/disabling from `SkyboxAgent`
- Users now have explicit control over when microphone permissions are requested
- Clear separation of concerns between agent and audio management

**Migration:**
```javascript
// Old (automatic)
await agent.startLiveSession({...});

// New (explicit)
await xb.core.sound.enableAudio();
await agent.startLiveSession({...});
await agent.stopLiveSession();
xb.core.sound.disableAudio();
```

### 4. **Session State Tracking**
- Added `LiveSessionState` interface for comprehensive session monitoring
- Track: message count, tool call count, duration, errors
- New methods: `getLiveSessionState()`, `getSessionDuration()`

### 5. **Audio Sample Rate Fixes**
- Fixed Gemini Live API audio playback (24kHz)
- Default AudioPlayer now uses 48kHz for general audio
- `playAIAudio()` automatically switches to 24kHz
- Added AudioContext resume check to prevent glitches
- Improved chunk playback timing with 1ms overlap to prevent clicks/pops

### 6. **Tool Parameter Serialization Fix**
- **Bug Fix**: `Tool.toJSON()` now always includes parameters when present
- Previously only included parameters if `required` field existed
- This prevented AI from seeing tool schemas properly

**Before:**
```typescript
if (this.parameters && this.parameters.required) {
  result.parameters = this.parameters;
}
```

**After:**
```typescript
if (this.parameters) {
  result.parameters = this.parameters;
}
```

### 7. **Unified Callback API**
- `startLiveSession()` callbacks now optional
- Supports both direct passing and separate setting patterns
- Callbacks wrapped to track session state automatically

## 📦 New Sample: Gemini Live Skybox Agent

Added `samples/skybox_agent/` demonstrating:
- Real-time voice conversation with Gemini Live API
- Automatic 360° skybox generation through natural language
- Proper tool execution and response handling
- User-friendly status messages and transcription display
- Best practices for audio lifecycle management

**Features:**
- Status area showing current operation
- Real-time transcription display
- Success (✓) / Error (✗) indicators
- Clean single-file implementation
- Comprehensive error handling

## 🔧 Files Modified

### SDK Core
- `src/agent/Tool.ts` - Added `ToolResult<T>`, async execute with error handling
- `src/agent/Agent.ts` - Added `AgentLifecycleCallbacks`, session state
- `src/agent/SkyboxAgent.ts` - Removed auto audio, added state tracking, helper methods
- `src/agent/tools/GenerateSkyboxTool.ts` - Updated to use `ToolResult<string>`
- `src/agent/tools/GetWeatherTool.ts` - Updated to use `ToolResult<WeatherData>`
- `src/agent/index.ts` - Export SkyboxAgent
- `src/sound/AudioPlayer.ts` - Fixed sample rate, added context resume, improved timing
- `src/sound/CoreSound.ts` - Default to 48kHz, auto-switch for AI audio
- `eslint.config.mjs` - Added `samples/**/*.js` to browser globals

### New Sample
- `samples/skybox_agent/GeminiSkyboxGenerator.js` - Complete application
- `samples/skybox_agent/TranscriptionManager.js` - Transcription helper
- `samples/skybox_agent/index.html` - Entry point

## 🎨 API Improvements

### New Helper Methods

**SkyboxAgent:**
- `getLiveSessionState()` - Get current session state
- `getSessionDuration()` - Get session duration in ms
- `createToolResponse(id, name, result)` - Static helper for formatting tool responses
- `validateToolResponse(response)` - Private validation

**Agent:**
- `getSessionState()` - Get agent state

## 📊 Impact

| Category | Before | After | Benefit |
|----------|--------|-------|---------|
| **Tool Results** | `unknown` or custom types | `ToolResult<T>` | Type safety, consistency |
| **Error Handling** | Throws/strings | Structured errors | Better debugging |
| **Audio Control** | Automatic | Explicit | Clear ownership |
| **Session State** | Hidden | Observable | Monitoring & debugging |
| **Audio Quality** | Glitchy/wrong pitch | Clean playback | Better UX |
| **Tool Discovery** | Broken (missing params) | Working | AI can use tools |

## ✅ Testing

- [x] No TypeScript compilation errors
- [x] No ESLint errors (except false positives for browser globals)
- [x] Build succeeds
- [x] Audio plays at correct pitch (24kHz for Gemini, 48kHz for general)
- [x] Tools are properly registered and callable by AI
- [x] Session state tracking works
- [x] Lifecycle callbacks fire correctly
- [x] Sample demonstrates all new features

## 🔄 Breaking Changes

### SkyboxAgent Audio Management
**Users must now explicitly manage audio lifecycle:**

```javascript
// Before
await agent.startLiveSession({...});
await agent.stopLiveSession();

// After
await xb.core.sound.enableAudio();
await agent.startLiveSession({...});
await agent.stopLiveSession();
xb.core.sound.disableAudio();
```

### Tool.execute() Return Type
**Tools now return `Promise<ToolResult>` instead of varying types:**

```typescript
// Update custom tools to return ToolResult
override async execute(args: Args): Promise<ToolResult<ReturnType>> {
  try {
    // do work
    return {success: true, data: result, metadata: {...}};
  } catch (e) {
    return {success: false, error: e.message};
  }
}
```

## 📝 Notes

- Maintains backwards compatibility where possible
- Clear migration paths for breaking changes
- Comprehensive JSDoc documentation added
- AudioPlayer defaults to 24kHz (matches Gemini Live), but CoreSound overrides to 48kHz for general use
- Sample demonstrates all new SDK features

## 🎯 Closes

Fixes issues with:
- Tool parameter serialization preventing AI from calling tools
- Audio playing at wrong pitch (high-pitched chipmunk voice)
- Lack of session state visibility
- Inconsistent error handling across tools
- Unclear audio lifecycle ownership

