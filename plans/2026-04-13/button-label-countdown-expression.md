<!-- session_id: 76d41657-6bc5-4dda-8fb4-06d103e016ae -->
# Button label countdown expression

## Context

The button in `/project1/button_hold_5s/hold_button1` currently has a static label "Hold 5s". The user wants a live countdown: "Hold 5s" → "Hold 4s" → ... → "Hold 1s" → "OK".

## Plan

Set `hold_button1.par.label` to EXPRESSION mode with a Python expression that reads the timer's channels:

```python
'OK' if op('timer_5s')['done'] > 0.5 else ('Hold ' + str(5 - int(op('timer_5s')['timer_fraction'] * 5)) + 's' if op('timer_5s')['running'] > 0.5 else 'Hold 5s')
```

Logic:
- `done > 0.5` → "OK"
- `running > 0.5` → "Hold Ns" where N = 5 - floor(elapsed seconds)
- else → "Hold 5s" (idle)

One `execute_python_script` call to set the expression.

## Verification

Check `btn.par.label.mode` is EXPRESSION and no errors on the button.
