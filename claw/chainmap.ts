export class ChainMap<K, V> {
    __inner: Map<K, V>[];

    constructor() {
        this.__inner = [];
    }

    push() {
        this.__inner.push(new Map())        
    }

    pop() {
        this.__inner.pop()
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
    #inner: [K, V][][];

    constructor(private equality: (a: K, b: K) => boolean) {
        this.#inner = [];
    }

    push() {
        this.#inner.push([]);
    } 

    pop() {
        this.#inner.pop();
    }

    get(k: K) {
        for (const layer of this.#inner.toReversed()) {
            const v = layer.find(([K, _]) => this.equality(k, K));
            if (v !== undefined) return v;
        }
        return undefined;
    }
    set(k: K, v: V) {
        const layer = this.#inner[this.#inner.length-1];
        const index = layer.findIndex(([K, _]) => this.equality(k, K));
        if (index !== -1)
            layer.splice(index, 1, [k, v])
        else 
            layer.push([k, v])
    }

    flatten(): [K, V][] {
        const out: [K, V][] = [];
        const addedKeys: K[] = [];
        for (const layer of this.#inner.toReversed()) {
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