const cmp = (a, b) => {
    if (a.major !== b.major) return a.major < b.major ? -1 : 1;
    if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
    if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
    return 0;
};

const parseParts = (raw) => {
    if (typeof raw !== 'string' || !raw.trim()) {
        throw new TypeError('Version spec must be a non-empty string');
    }

    const match = raw.trim().match(/^(\^|~|>=|<=|>|<|=)?\s*(\d+(?:[._]\d+){0,2})$/);
    if (!match) {
        throw new TypeError(`Invalid version spec: ${raw}`);
    }

    const op = match[1] || null;
    const rawParts = match[2].split(/[._]/).map((n) => parseInt(n, 10));
    const partsLen = rawParts.length;

    const major = rawParts[0] ?? 0;
    const minor = rawParts[1] ?? 0;
    const patch = rawParts[2] ?? 0;

    return { op, partsLen, version: { major, minor, patch } };
};

export const formatVersion = ({ major = 0, minor = 0, patch = 0 } = {}) => `${major}.${minor}.${patch}`;

export const satisfiesVersionSpec = (currentVersion, versionSpec) => {
    if (!versionSpec) return true;

    const current = {
        major: Number(currentVersion.major || 0),
        minor: Number(currentVersion.minor || 0),
        patch: Number(currentVersion.patch || 0),
    };

    const { op, partsLen, version: target } = parseParts(versionSpec);

    const gte = (v) => cmp(current, v) >= 0;
    const gt = (v) => cmp(current, v) > 0;
    const lte = (v) => cmp(current, v) <= 0;
    const lt = (v) => cmp(current, v) < 0;
    const eq = (v) => cmp(current, v) === 0;

    if (op === '>') return gt(target);
    if (op === '>=') return gte(target);
    if (op === '<') return lt(target);
    if (op === '<=') return lte(target);
    if (op === '=') return eq(target);

    if (op === '^') {
        const lower = target;
        let upper;

        if (target.major > 0) {
            upper = { major: target.major + 1, minor: 0, patch: 0 };
        } else if (target.minor > 0) {
            upper = { major: 0, minor: target.minor + 1, patch: 0 };
        } else {
            upper = { major: 0, minor: 0, patch: target.patch + 1 };
        }

        return gte(lower) && lt(upper);
    }

    if (op === '~') {
        const lower = target;
        let upper;

        if (partsLen <= 1) {
            upper = { major: target.major + 1, minor: 0, patch: 0 };
        } else {
            upper = { major: target.major, minor: target.minor + 1, patch: 0 };
        }

        return gte(lower) && lt(upper);
    }

    // Bare version semantics
    if (partsLen === 1) {
        return gte({ major: target.major, minor: 0, patch: 0 })
            && lt({ major: target.major + 1, minor: 0, patch: 0 });
    }

    if (partsLen === 2) {
        return gte({ major: target.major, minor: target.minor, patch: 0 })
            && lt({ major: target.major, minor: target.minor + 1, patch: 0 });
    }

    return eq(target);
};
