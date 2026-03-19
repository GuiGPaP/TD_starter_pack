# Debugging

Check errors, inspect layout, and diagnose operator issues.

```python
err = op('/project1/base1').errors(recurse=True)
print(err)
```

## The Frame-Boundary Rule

TD updates error state on frame boundaries. When fixing errors via MCP, always use two separate calls:

```python
# Call 1: Fix the error
const.par.value.expr = 'math.sin(absTime.seconds)'
```

```python
# Call 2: Verify (MUST be separate execute_python_script call)
op('/project1/base1').cook(force=True)
result = op('/project1/base1').errors(recurse=True)
```

If you check errors in the same call as the fix, you get stale cached errors.

## Print Layout

```python
for child in sorted(base.children, key=lambda c: (c.nodeX, c.nodeY)):
    print(f"{child.name}: ({child.nodeX}, {child.nodeY})")
```

## List Docked Operators

```python
for d in op('glslmat1').docked:
    print(f"{d.name}: {d.opType}")
```

## Search Parameters

```python
for p in op('glsl1').pars():
    if 'vec' in p.name.lower():
        print(f"{p.name}: {p.val}")
```
