export class ChainMap<K, V> {
    __inner: Map<K, V>[];

    constructor() {
        this.__inner = [];
    }

    push() {
        const v = this.__inner.length;
        this.__inner.push(new Map())        
        return v;
    }
    pop() {
        this.__inner.pop();
    }

    restore(to: number) {
        this.__inner = this.__inner.slice(0, to)
    }

    get(k: K) {
        for (const layer of this.__inner.toReversed()) {
            if (layer.has(k)) return layer.get(k);
        }
        return undefined;
    }
    set(k: K, v: V) {
        this.__inner[this.__inner.length-1].set(k, v);
    }

    flatten(): Map<K, V> {
        const out = new Map();
        for (const layer of this.__inner.toReversed()) {
            for (const [k, v] of layer)
                if (!out.has(k)) out.set(k, v);
        }
        return out;
    }
}
export class ChainArray<V> {
    layers: V[][]
    constructor() {
        this.layers = [];
    }

    stack() {
        this.layers.push([])
    }

    take() {
        this.layers.pop();
    }

    push(v: V) {
        this.layers[this.layers.length-1].push(v);
    }

    flatten() {
        return this.layers.flat();
    }
}

export class ChainCustomMap<K, V> {
    __inner: [K, V][][];

    constructor(private equality: (a: K, b: K) => boolean) {
        this.__inner = [];
    }

    push() {
        this.__inner.push([]);
    } 

    pop() {
        this.__inner.pop();
    }

    get(k: K) {
        for (const layer of this.__inner.toReversed()) {
            const v = layer.find(([K, _]) => this.equality(k, K));
            if (v !== undefined) return v;
        }
        return undefined;
    }
    set(k: K, v: V) {
        const layer = this.__inner[this.__inner.length-1];
        const index = layer.findIndex(([K, _]) => this.equality(k, K));
        if (index !== -1)
            layer.splice(index, 1, [k, v])
        else 
            layer.push([k, v])
    }
    has(k: K) {
        for (const layer of this.__inner.toReversed()) {
            const v = layer.find(([K, _]) => this.equality(k, K));
            if (v !== undefined) return true;
        }
        return false
    }

    flatten(): [K, V][] {
        const out: [K, V][] = [];
        const addedKeys: K[] = [];
        for (const layer of this.__inner.toReversed()) {
            for (const [key, value] of layer) {
                if (addedKeys.find(a => this.equality(a, key)) === undefined) {
                    out.push([key, value]);
                    addedKeys.push(key)
                }
            }
        }

        return out;
    }
}

export class MultiMap<K, V> {
    inner: Map<K, V[]>

    constructor() {
        this.inner = new Map();
    }

    push(k: K, v: V) {
        if (this.inner.has(k)) this.inner.get(k)!.push(v);
        else this.inner.set(k, [v]);
    }

    get(k: K): V[] | undefined {
        return this.inner.get(k);
    }

    has(k: K): boolean {
        return this.inner.has(k);
    }
}