export const AbstractSugar = Class => class extends Class {
    get isSugar() { return true; }
}