import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
/**
 * Out-of-tree plugins resolve Node imports from *their own* directory, so
 * peerDependencies that only exist inside the Harness install are invisible.
 * Import Harness packages by absolute file URL under $DSH_HOME instead.
 */
function harnessNodeModulesRoots() {
    const roots = [];
    if (process.env.DSH_HOME) {
        roots.push(join(process.env.DSH_HOME, 'profiles', 'node_modules'));
    }
    const home = process.env.USERPROFILE || process.env.HOME;
    if (home) {
        roots.push(join(home, '.dsh', 'profiles', 'node_modules'));
    }
    return roots;
}
export async function importHarnessPackage(packageName, entry = 'lib/index.js') {
    const parts = packageName.split('/');
    for (const root of harnessNodeModulesRoots()) {
        const file = join(root, ...parts, entry);
        if (existsSync(file)) {
            return (await import(pathToFileURL(file).href));
        }
    }
    // Fallback for in-tree / properly installed peers
    return (await import(packageName));
}
//# sourceMappingURL=harness-import.js.map