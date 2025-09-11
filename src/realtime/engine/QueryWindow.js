import { SimpleEmitter, deepEqual } from "./utils.js";
import { ExprEngine } from "./ExprEngine.js";

export class QueryWindow extends SimpleEmitter {
    constructor({ whereExpr = null, selectList = null } = {}) {
        super();
        this.whereExpr = whereExpr;
        this.selectList = selectList;
        this.view = new Map();
        this.expr = new ExprEngine();
        this._unsubscribe = null;
    }

    attach(fromEngine) {
        if (this._unsubscribe) this.detach();
        this._unsubscribe = fromEngine.on("data", evt => this._handle(evt));
    }

    detach() {
        if (this._unsubscribe) this._unsubscribe();
        this._unsubscribe = null;
    }

    _handle(evt) {
        const { kind, rowId, rowObj } = evt;

        if (kind === "delete") {
            if (this.view.has(rowId)) {
                this.view.delete(rowId);
                this.emit("data", { kind: "delete", rowId });
            }
            return;
        }

        const passes = !this.whereExpr || Boolean(this.expr.eval(this.whereExpr, rowObj));

        if (!passes) {
            if (this.view.has(rowId)) {
                this.view.delete(rowId);
                this.emit("data", { kind: "delete", rowId });
            }
            return;
        }

        const projected = this._project(rowObj);

        if (!this.view.has(rowId)) {
            this.view.set(rowId, projected);
            this.emit("data", { kind: "insert", rowId, projectedRow: projected });
        } else {
            const prev = this.view.get(rowId);
            if (!deepEqual(prev, projected)) {
                this.view.set(rowId, projected);
                this.emit("data", { kind: "patch", rowId, projectedRow: projected });
            }
        }
    }

    _project(rowObj) {
        if (!this.selectList) return rowObj;
        const out = {};
        for (const item of this.selectList) {
            const key = item.alias ?? (item.expr?.value ?? "expr");
            out[key] = this.expr.eval(item.expr, rowObj);
        }
        return out;
    }
}
