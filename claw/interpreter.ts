class BaseClawValue {

}

class NumberClawValue extends BaseClawValue {
    value: number;
    constructor(value: number) {
        super();
        this.value = value;
    }
}
class StringClawValue extends BaseClawValue {
    constructor(public value: string) {
        super();
    }
}
class BooleanClawValue extends BaseClawValue {
    constructor(public value: boolean) {
        super();
    }
}
class PointerClawValue extends BaseClawValue {
    
}

type ClawValue = NumberClawValue | StringClawValue | BooleanClawValue;
type ClawPointer = number;

export class Interpreter {
    
}