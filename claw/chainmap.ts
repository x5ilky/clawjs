export class ChainMap<K, V> {
    #inner: Map<K, V>[];

    constructor() {
        this.#inner = [];
    }

    push() {
        this.#inner.push(new Map())        
    }

    pop() {
        this.#inner.pop()
    }
    
    get(k: K) {
        for (const layer of this.#inner.toReversed()) {
            if (layer.has(k)) return layer.get(k);
        }
        return undefined;
    }
    set(k: K, v: V) {
        this.#inner[this.#inner.length-1].set(k, v);
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
}