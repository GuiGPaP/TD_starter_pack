/**
 * Generate a Python script that scans the TD operator tree and collects
 * structural data for lesson detection (connections, types, errors, anomalies).
 *
 * The script is executed via `tdClient.execPythonScript()` in read-only mode.
 * It assigns its output to the `result` variable for auto-serialization.
 */
export function generateScanLessonScript(
	rootPath = "/project1",
	maxDepth = 5,
): string {
	return `
_root = op(${JSON.stringify(rootPath)})
_children = _root.findChildren(maxDepth=${maxDepth})
_ops = []
_connections = []
_anomalies = []
_errors = []
_seen_paths = set()

for _c in _children:
    _path = _c.path
    _seen_paths.add(_path)
    _op_type = _c.OPType
    _fam = _c.family

    _op_info = {
        "path": _path,
        "opType": _op_type,
        "family": _fam,
    }
    _ops.append(_op_info)

    # Collect connections (inputs)
    try:
        for _i, _conn in enumerate(_c.inputConnectors):
            for _con in _conn.connections:
                _src = _con.owner
                if _src and hasattr(_src, 'path'):
                    _connections.append({
                        "from": _src.path,
                        "fromOutput": 0,
                        "to": _path,
                        "toInput": _i,
                    })
    except Exception:
        pass

    # Detect errors
    try:
        _errs = _c.errors()
        if _errs:
            _errors.append({"path": _path, "message": str(_errs)})
    except Exception:
        pass

    # Detect anomalies: instancing config on Geometry COMPs
    if _fam == "COMP" and _op_type == "geometryCOMP":
        try:
            _inst = _c.par.instancechop.val
            if _inst:
                _anomalies.append({
                    "path": _path,
                    "type": "instancing",
                    "detail": str(_inst),
                })
        except Exception:
            pass

    # Detect anomalies: CHOP exports
    if _fam == "CHOP":
        try:
            if hasattr(_c, 'export') and _c.export:
                _anomalies.append({
                    "path": _path,
                    "type": "chop_export",
                    "detail": "CHOP has active export",
                })
        except Exception:
            pass

# Detect orphan operators (no connections at all)
_connected_paths = set()
for _conn in _connections:
    _connected_paths.add(_conn["from"])
    _connected_paths.add(_conn["to"])

for _op in _ops:
    if _op["path"] not in _connected_paths:
        # Skip COMPs (they contain children, not always connected)
        if _op["family"] != "COMP":
            _anomalies.append({
                "path": _op["path"],
                "type": "orphan",
                "detail": "No connections",
            })

result = {
    "operators": _ops,
    "connections": _connections,
    "anomalies": _anomalies,
    "errors": _errors,
}
`;
}
