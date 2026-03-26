/**
 * Python scripts executed inside TouchDesigner for palette operations.
 */

/**
 * Build the Python script that indexes all .tox files in the TD Palette.
 *
 * Scans two sources:
 * - Builtin: `td.app.installFolder/Samples/Palette/`
 * - User:    `~/Documents/Derivative/Palette/`
 *
 * Each entry gets a `source` tag ("builtin" or "user") for filtering.
 */
export function buildIndexPaletteScript(): string {
	return `
import json, os, datetime

builtin_root = os.path.join(td.app.installFolder, 'Samples', 'Palette').replace('\\\\', '/')
user_root = os.path.join(os.path.expanduser('~'), 'Documents', 'Derivative', 'Palette').replace('\\\\', '/')

palette_roots = []
if os.path.isdir(builtin_root):
    palette_roots.append(('builtin', builtin_root))
if os.path.isdir(user_root):
    palette_roots.append(('user', user_root))

if not palette_roots:
    result = json.dumps({"error": "No palette directories found"})
else:
    entries = []
    temp_container = op('/project1').create(td.baseCOMP, '__palette_scan_temp__')

    for source, palette_root in palette_roots:
        for dirpath, dirnames, filenames in os.walk(palette_root):
            dirnames.sort()
            rel_dir = os.path.relpath(dirpath, palette_root).replace('\\\\', '/')
            if rel_dir == '.':
                continue  # skip palette root itself
            category = rel_dir.split('/')[0]  # top-level folder = category

            for fname in sorted(filenames):
                if not fname.lower().endswith('.tox'):
                    continue
                tox_path = os.path.join(dirpath, fname).replace('\\\\', '/')
                name = fname[:-4]
                rel_path = (rel_dir + '/' + fname)

                entry = {
                    "name": name,
                    "category": category,
                    "toxPath": tox_path,
                    "relativePath": rel_path,
                    "author": "Derivative" if source == 'builtin' else "",
                    "tags": [category.lower(), source],
                    "description": "",
                    "source": source,
                }

                try:
                    loaded = temp_container.loadTox(tox_path)
                    if loaded is not None:
                        # Extract documentation parameters
                        for par_name in ('Help', 'help'):
                            p = getattr(loaded.par, par_name, None)
                            if p is not None:
                                val = str(p)
                                if val:
                                    entry["help"] = val
                                    entry["description"] = val[:200]
                                break

                        for par_name in ('Tags', 'tags'):
                            p = getattr(loaded.par, par_name, None)
                            if p is not None:
                                raw = str(p)
                                if raw:
                                    parsed = [t.strip() for t in raw.split(',') if t.strip()]
                                    if parsed:
                                        entry["tags"] = parsed + [category.lower(), source]
                                break

                        for par_name in ('Author', 'author'):
                            p = getattr(loaded.par, par_name, None)
                            if p is not None:
                                val = str(p)
                                if val:
                                    entry["author"] = val
                                break

                        for par_name in ('Version', 'version'):
                            p = getattr(loaded.par, par_name, None)
                            if p is not None:
                                val = str(p)
                                if val:
                                    entry["version"] = val
                                break

                        # Count operators by family (depth 2)
                        op_counts = {}
                        for c in loaded.findChildren(depth=2):
                            fam = c.family
                            if fam:
                                op_counts[fam] = op_counts.get(fam, 0) + 1
                        if op_counts:
                            entry["operators"] = op_counts

                        # Top-level children names
                        entry["topLevelChildren"] = [c.name for c in loaded.children]

                        loaded.destroy()
                except Exception:
                    pass  # filesystem-only entry is still useful

                entries.append(entry)

    # Clean up temp container
    temp_container.destroy()

    roots_scanned = [r for _, r in palette_roots]
    result = json.dumps({
        "schemaVersion": "1.0",
        "tdVersion": str(td.app.version),
        "tdBuild": str(getattr(td.app, 'build', '')),
        "paletteRoot": roots_scanned[0],
        "userPaletteRoot": roots_scanned[1] if len(roots_scanned) > 1 else None,
        "indexedAt": datetime.datetime.now().isoformat(),
        "entryCount": len(entries),
        "entries": entries,
    })
`.trim();
}

/**
 * Build a Python script that loads a .tox from the Palette into the project.
 */
export function buildLoadPaletteScript(
	toxPath: string,
	parentPath: string,
	componentName: string,
): string {
	const safeToxPath = toxPath.replace(/\\/g, "/");
	return `
import json

tox_path = ${JSON.stringify(safeToxPath)}
parent_path = ${JSON.stringify(parentPath)}
comp_name = ${JSON.stringify(componentName)}

parent = op(parent_path)
if parent is None:
    result = json.dumps({"status": "error", "message": "Parent not found: " + parent_path})
else:
    existing = parent.op(comp_name)
    if existing is not None:
        result = json.dumps({"status": "exists", "path": existing.path, "message": "Already exists: " + existing.path})
    else:
        try:
            loaded = parent.loadTox(tox_path)
            if loaded is None:
                result = json.dumps({"status": "error", "message": "Failed to load: " + tox_path})
            else:
                if loaded.name != comp_name:
                    loaded.name = comp_name
                result = json.dumps({"status": "loaded", "path": loaded.path, "name": loaded.name})
        except Exception as e:
            result = json.dumps({"status": "error", "message": str(e)})
`.trim();
}
