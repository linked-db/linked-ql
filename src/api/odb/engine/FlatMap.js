export class FlatMap extends Set {

    add(node) {
        for (const _node of this) {
            // If parent already added, abort
            if (_node.contains(node)) return this;
        }
        return super.add(node);
    }

    delete(node) {
        const rt = super.delete(node);
        for (const _node of this) {
            // If _node is a child, remove too
            if (node.contains(_node)) super.delete(_node);
        }
        return rt;
    }
}