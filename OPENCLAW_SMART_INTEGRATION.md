# Mnemo Smart Activation - OpenClaw Integration

## Quick Setup (3 minutes)

### Step 1: Install the Hook

```bash
# Copy hook to OpenClaw hooks directory
cp /path/to/Mnemo/mnemo-smart-hook.js ~/.openclaw/hooks/
```

### Step 2: Configure OpenClaw

```json
// ~/.openclaw/config.json
{
  "hooks": {
    "messageReceived": ["mnemo-smart-hook.js"]
  },
  "mnemo": {
    "url": "http://localhost:10000",
    "enabled": true
  }
}
```

### Step 3: Start Mnemo Server

```bash
cd /path/to/Mnemo
./start.sh start
```

### Step 4: Test It

Send any of these messages in your chat:

- **"New project TestApp"** → Mnemo creates project and stores goal
- **"I decided to use React"** → Mnemo stores as decision
- **"Bug: login is broken"** → Mnemo stores as error/issue
- **"Just shipped v1.0!"** → Mnemo stores as milestone

## How It Works

### Automatic Triggers

Mnemo activates when you write:

| Trigger Type | Examples | Score | Action |
|--------------|----------|-------|--------|
| **New Project** | "new project X", "create project X" | 9/10 | Auto-store + create project |
| **Decisions** | "I decided to...", "going with..." | 7/10 | Auto-store |
| **Milestones** | "shipped", "released v1.0", "deployed" | 8/10 | Auto-store |
| **Bugs/Issues** | "bug:", "error:", "not working" | 7/10 | Auto-store |
| **Security** | "api key", "password", "secret" | 9/10 | Auto-store |
| **Goals** | "goal is...", "plan to...", "need to" | 6/10 | Auto-store |
| **Learnings** | "learned that...", "realized..." | 5/10 | Suggest storage |
| **Preferences** | "I prefer...", "I like..." | 4/10 | Ignore (too low) |

### Project Detection

Mnemo automatically detects which project you're talking about:

1. **Explicit**: "New project GulfWatch" → Creates/switches to gulfwatch project
2. **Mention**: "Gulf Watch needs fixes" → Switches to gulfwatch project
3. **Context**: Uses current project from conversation context

### Smart Storage Rules

```
Score 8-10: Auto-store + notify ("💾 Saved: ...")
Score 5-7:  Auto-store silently
Score <5:   Ignore (casual chat)
```

## Customization

### Adjust Thresholds

```javascript
const hook = new MnemoSmartHook({
  threshold: {
    autoStore: 7,   // Lower = more aggressive storage
    suggest: 5,     // Lower = more suggestions
    ignore: 0
  }
});
```

### Add Custom Triggers

Edit `mnemo-smart-hook.js`:

```javascript
this.SMART_TRIGGERS.custom = {
  patterns: ['blockchain', 'smart contract', 'tokenomics'],
  score: 6,
  type: 'insight'
};
```

### Enable Telegram Notifications

```javascript
const hook = new MnemoSmartHook();
hook.setTelegramBot(telegramBot, chatId);
```

## Testing

Run the built-in test suite:

```bash
cd /path/to/Mnemo
node mnemo-smart-hook.js
```

Expected output:
```
🧠 Mnemo Smart Hook - Test Mode

Message: "New project MoltBase"
Score: 9/10 | Type: goal | Project: moltbase
Action: STORED

Message: "Bug: API returns 500"
Score: 7/10 | Type: error | Project: general
Action: STORED

Message: "Hey, how are you?"
Score: 1/10 | Type: insight | Project: general
Action: IGNORED

✅ Test complete
```

## Troubleshooting

### "Mnemo server not found"
- Make sure Mnemo is running: `./start.sh start`
- Check URL in config: `http://localhost:10000`

### "Not storing anything"
- Check threshold settings (may be too high)
- Test with explicit trigger: "New project Test"
- Check Mnemo server logs

### "Storing too much"
- Raise threshold: `{ threshold: { autoStore: 8 } }`
- Add exclude patterns for casual phrases

## Architecture

```
User Message
    │
    ▼
┌─────────────────────┐
│ Smart Hook Analysis │
│ - Check triggers    │
│ - Score importance  │
│ - Detect project    │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    │             │
  Score 8+      Score 5-7
    │             │
    ▼             ▼
┌─────────┐  ┌──────────┐
│ Store + │  │ Store    │
│ Notify  │  │ Silently │
└─────────┘  └──────────┘
    │
    ▼
Mnemo SQLite DB
```

## Benefits

✅ **Never Miss Context** - Important stuff auto-saved  
✅ **Zero Friction** - No commands needed  
✅ **Smart Filtering** - Ignores casual chat  
✅ **Project Aware** - Auto-detects current project  
✅ **Privacy First** - All local processing  

## Next Steps

1. Run test suite: `node mnemo-smart-hook.js`
2. Install in OpenClaw hooks
3. Chat naturally - Mnemo captures important stuff automatically
4. Review stored memories at `http://localhost:10000`
