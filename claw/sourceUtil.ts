export class SourceHelper {
    source: string

    indexedLines: [[string, number][], number][]

    constructor(source: string) {
        this.source = source;
        this.indexedLines = [];
        
        let i = 0;
        for (const line of source.split("\n")) {
            const out = [];
            for (const ch of line.split("")) {
                out.push([ch, i] as [string, number]);
                i++;
            }
            i++; 
            this.indexedLines.push([out, i]);
        }
    }

    getLines(start: number, end: number): string[] {
        let i = 0;
        const out = [];
        for (const [ln, idx] of this.indexedLines) {
            i += idx;
            if (idx > start && idx <= end) {
                out.push(ln.map(a => a[0]).join(""))
            }
        }
        return out;
    }
}