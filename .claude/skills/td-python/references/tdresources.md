# TDResources Reference

`op.TDResources` is a singleton system COMP providing UI popups, HTTP client, file download, and mouse input.

## Contents

1. [PopMenu](#popmenu)
2. [PopDialog](#popdialog)
3. [WebClient](#webclient)
4. [FileDownloader](#filedownloader)
5. [MouseCHOP](#mousechop)

---

## PopMenu

```python
op.TDResources.op('popMenu').Open(
    menuItems,          # list of str (or list of lists for submenus, max 2 levels)
    callback,           # function(info) where info = {'index': int, 'item': str, ...}
    callbackDetails=None,  # arbitrary data passed through to callback
    autoClose=True,
    rolloverOpen=False
)
```

- Submenus: nest lists — `['Top', ['Sub1', 'Sub2']]` creates "Top" with a submenu
- Max 2 nesting levels
- Callback receives `info['index'] == -1` when menu is dismissed without selection

**ButtonPopMenu** — similar but attached to a button widget. Does **not** support submenus.

## PopDialog

```python
op.TDResources.op('popDialog').Open(
    text='Message',         # dialog body
    title='Title',          # title bar
    buttons=['OK', 'Cancel'],  # max 4 buttons
    callback=myCallback,    # function(info) where info = {'button': str, 'buttonNum': int, ...}
    textEntry=False,        # show text input field
    default='',             # default text entry value
    escButton=2,            # button index for Escape key (1-based)
    enterButton=1,          # button index for Enter key (1-based)
    escOnClickAway=True
)
```

- Callback `info['enteredText']` contains the text field value if `textEntry=True`
- Max 4 buttons — additional buttons are silently ignored

## WebClient

```python
op.TDResources.op('webClient').Request(
    callback,       # function(statusCode, headerDict, data, id)
    url,
    method='GET',   # GET, POST, PUT, DELETE, HEAD
    header=None,    # dict of headers
    data=None,      # str or bytes body
    contentType=None,
    id=None         # arbitrary id passed to callback
)
```

- **callback signature:** `def onResponse(statusCode, headerDict, data, id)`
- `statusCode` is `None` on timeout/connection failure — always check
- `data` is `bytes` — decode with `data.decode('utf-8')` for text

```python
# Good — handle None status
def onResponse(status, headers, data, id):
    if status is None:
        debug('Request timed out')
        return
    if status != 200:
        debug(f'HTTP {status}')
        return
    result = data.decode('utf-8')
```

For threading and ThreadManager, see **td-guide** → `python-environment.md`.

## FileDownloader

```python
op.TDResources.op('fileDownloader').Download(
    url,
    localPath,
    callback=None,      # function(info) — info has 'success', 'localPath', 'url'
    dwnldCopy=False,    # True = download to temp, copy to localPath
    force=False,        # True = overwrite existing file
    uploadFile=None     # str path — sends PUT with file body (upload, not download)
)
```

- `dwnldCopy=True` is safer for large files — avoids partial writes at `localPath`
- `uploadFile` repurposes the method as a **PUT upload** — the `url` is the upload target
- `force=False` skips download if `localPath` already exists

## MouseCHOP

`op.TDResources.op('mouseCHOP')` — a Mouse In CHOP providing:

| Channel | Description |
|---|---|
| `tx`, `ty` | Mouse position (pixels) |
| `lselect` | Left button (0/1) |
| `mselect` | Middle button (0/1) |
| `rselect` | Right button (0/1) |
| `wheel` | Scroll wheel delta |
